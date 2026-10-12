import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { AssetImage, AssetImageEvent } from './asset-image.entity';
import { Employee } from '../employees/employee.entity';
import { deleteObject, downloadObject, gcsConfigured, uploadObject } from './gcs.util';

const WRITE_ROLES = ['MASTER', 'ADMIN', 'USER']; // 현장 촬영은 일반 사용자도 가능
const MAX_BYTES = 10 * 1024 * 1024;              // 원본 10MB (변환 후엔 훨씬 작아짐)
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_PER_EVENT = 10;

@Injectable()
export class AssetImagesService {
  private readonly logger = new Logger(AssetImagesService.name);

  constructor(
    @InjectRepository(AssetImage) private readonly repo: Repository<AssetImage>,
  ) {}

  private assertWrite(user: Employee) {
    if (!WRITE_ROLES.includes(user.man_roll)) {
      throw new ForbiddenException('ERR_AUTH_006: 사진을 등록할 권한이 없습니다');
    }
  }

  private assertEvent(eventType: string) {
    if (!Object.values(AssetImageEvent).includes(eventType as AssetImageEvent)) {
      throw new BadRequestException(`ERR_VALID_010: 알 수 없는 이벤트 유형입니다 (${eventType})`);
    }
  }

  /** 사진 업로드 — 장변 1600px webp 본문 + 320px 썸네일 생성 후 GCS 저장 */
  async upload(
    file: Express.Multer.File,
    dto: { serial_number_id: number; event_type: string; event_no?: string; note?: string },
    user: Employee,
  ): Promise<AssetImage> {
    this.assertWrite(user);
    this.assertEvent(dto.event_type);
    if (!gcsConfigured()) {
      throw new BadRequestException('ERR_CONF_001: 사진 저장소가 설정되지 않았습니다 (GCS_ASSET_BUCKET)');
    }
    if (!file) throw new BadRequestException('ERR_VALID_010: 파일이 없습니다');
    if (!ALLOWED.includes(file.mimetype)) {
      throw new BadRequestException(`ERR_VALID_010: 지원하지 않는 형식입니다 (${file.mimetype})`);
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('ERR_VALID_010: 사진은 10MB 이하만 등록할 수 있습니다');
    }

    const count = await this.repo.count({
      where: {
        serial_number_id: dto.serial_number_id,
        event_type: dto.event_type,
        event_no: dto.event_no ? dto.event_no : IsNull(),
      },
    });
    if (count >= MAX_PER_EVENT) {
      throw new BadRequestException(`ERR_VALID_010: 한 건당 사진은 ${MAX_PER_EVENT}장까지 등록할 수 있습니다`);
    }

    // 회전 정보(EXIF) 반영 후 리사이즈 — 모바일 촬영 사진이 눕지 않도록
    const base = sharp(file.buffer, { failOn: 'none' }).rotate();
    const [main, thumb] = await Promise.all([
      base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 }).toBuffer(),
      base.clone().resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70 }).toBuffer(),
    ]);

    const key = uuidv4();
    const dir = `serials/${dto.serial_number_id}`;
    const objectPath = `${dir}/${key}.webp`;
    const thumbPath = `${dir}/${key}_thumb.webp`;
    await Promise.all([
      uploadObject(objectPath, main, 'image/webp'),
      uploadObject(thumbPath, thumb, 'image/webp'),
    ]);

    return this.repo.save(this.repo.create({
      serial_number_id: dto.serial_number_id,
      event_type: dto.event_type,
      event_no: dto.event_no ?? null,
      object_path: objectPath,
      thumb_path: thumbPath,
      original_name: file.originalname ?? null,
      size: main.length,
      uploaded_by: user.man_no,
      uploaded_by_name: user.name,
      note: dto.note ?? null,
    }));
  }

  /** S/N의 사진 이력 (최신순) */
  findBySerial(serialNumberId: number): Promise<AssetImage[]> {
    return this.repo.find({
      where: { serial_number_id: serialNumberId },
      order: { created_at: 'DESC' },
    });
  }

  /** 특정 이벤트 문서(입고/납품/사용/이동)에 등록된 사진 */
  findByEvent(eventType: string, eventNo: string): Promise<AssetImage[]> {
    return this.repo.find({
      where: { event_type: eventType, event_no: eventNo },
      order: { created_at: 'DESC' },
    });
  }

  /** 여러 S/N의 최신 사진 1장씩 — 재고상세 목록에서 N+1 없이 썸네일 표시 */
  async latestBySerials(ids: number[]): Promise<Record<number, AssetImage>> {
    if (!ids.length) return {};
    const rows = await this.repo.find({
      where: { serial_number_id: In(ids) },
      order: { created_at: 'DESC' },
    });
    const out: Record<number, AssetImage> = {};
    for (const r of rows) {
      if (!out[r.serial_number_id]) out[r.serial_number_id] = r;  // 최신순이라 첫 건이 최신
    }
    return out;
  }

  /** 이미지 바이너리 — 비공개 버킷이라 백엔드가 인증 후 스트리밍한다 */
  async getBinary(id: string, thumb: boolean): Promise<{ buffer: Buffer; contentType: string }> {
    const img = await this.repo.findOne({ where: { id } });
    if (!img) throw new NotFoundException('ERR_RES_001');
    const buffer = await downloadObject(thumb ? img.thumb_path : img.object_path);
    return { buffer, contentType: 'image/webp' };
  }

  async remove(id: string, user: Employee): Promise<{ id: string }> {
    this.assertWrite(user);
    const img = await this.repo.findOne({ where: { id } });
    if (!img) throw new NotFoundException('ERR_RES_001');
    // 본인 등록분만 삭제 (관리자는 전체)
    if (user.man_roll === 'USER' && img.uploaded_by !== user.man_no) {
      throw new ForbiddenException('ERR_AUTH_006: 본인이 등록한 사진만 삭제할 수 있습니다');
    }
    await this.repo.delete({ id });
    // 객체 삭제 실패는 무시 — DB 레코드가 정본이고 버킷 lifecycle이 정리한다
    try {
      await Promise.all([deleteObject(img.object_path), deleteObject(img.thumb_path)]);
    } catch (err) {
      this.logger.warn(`GCS 객체 삭제 실패 (${img.object_path}): ${(err as Error)?.message ?? err}`);
    }
    return { id };
  }
}
