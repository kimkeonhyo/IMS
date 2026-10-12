import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { SerialNumber, SerialStatus } from './serial-number.entity';
import { Employee } from '../employees/employee.entity';

@Injectable()
export class SerialNumbersService {
  constructor(
    @InjectRepository(SerialNumber)
    private readonly repo: Repository<SerialNumber>,
    private readonly dataSource: DataSource,
  ) {}

  /** 특정 품목의 S/N 목록 (창고 필터 옵션)
   *  - 기본: 재고(STOCK) 상태만 (재고사용/이동/납품 등록용)
   *  - includeInUse=true: 취소 제외 전체 상태(사용중 등 포함) — 이미 설치된 네트워크 장비 등록용 */
  findAvailable(item_code: string, storage_code?: string, includeInUse = false) {
    const qb = this.repo.createQueryBuilder('sn')
      .where('sn.item_code = :item_code', { item_code })
      .orderBy('sn.serial_no', 'ASC');

    if (includeInUse) {
      // 사용중 장비는 storage_code가 비어있는 경우가 많아 창고 필터를 적용하지 않음
      qb.andWhere('sn.status != :cancelled', { cancelled: SerialStatus.CANCELLED });
    } else {
      qb.andWhere('sn.status = :status', { status: SerialStatus.STOCK });
      if (storage_code) {
        qb.andWhere('sn.storage_code = :storage_code', { storage_code });
      }
    }
    return qb.getMany();
  }

  /** 재고현황 - 특정 품목의 S/N 목록
   *  PRIVATE 품목:
   *  - MASTER     : 전체 S/N 조회
   *  - 비MASTER   : 본인 활성 usage_no에 직접 연결된 S/N만 반환 (없으면 빈 배열)
   */
  async findByItem(item_code: string, user: Employee) {
    const [item] = await this.dataSource.query(
      `SELECT visibility FROM items WHERE item_code = $1`, [item_code],
    );
    const isPrivate = item?.visibility === 'PRIVATE';

    if (isPrivate && user.man_roll !== 'MASTER') {
      const userUsages: Array<{ usage_no: string }> = await this.dataSource.query(
        `SELECT usage_no FROM stock_usages
         WHERE item_code = $1
           AND use_man_no = $2
           AND status IN ('PENDING','COMPLETED')
           AND is_cancelled = 0`,
        [item_code, user.man_no],
      );
      if (userUsages.length === 0) return [];

      const usageNos = userUsages.map(u => u.usage_no);
      return this.findByItemWithUser(item_code, usageNos);
    }

    return this.findByItemWithUser(item_code);
  }

  /** S/N 목록 + 사용자(USED/PENDING) + 납품처(SHIPPED) 포함 */
  private async findByItemWithUser(item_code: string, usageNos?: string[]) {
    const rows: Array<{
      id: number; serial_no: string; item_code: string; status: string;
      storage_code: string | null; store_item_id: string;
      shipment_item_id: string | null; usage_no: string | null;
      tags: Record<string, string> | null; created_at: Date; updated_at: Date;
      use_name: string | null; use_man_name: string | null;
      usage_status: string | null;
      use_until: string | null; is_indefinite: number | null;
      use_place_code: string | null; use_place_name: string | null; use_place_storage_name: string | null;
      customer_name: string | null;
      repair_no: string | null; repair_expected_done_at: string | null;
      repair_vendor: string | null; repair_status: string | null;
    }> = await this.dataSource.query(
      `SELECT sn.*,
              su.use_name,
              su.status AS usage_status,
              to_char(su.use_until, 'YYYY-MM-DD') AS use_until,
              su.is_indefinite,
              su.use_place_code,
              su.use_place_name,
              ps.storage_name AS use_place_storage_name,
              e.name  AS use_man_name,
              sh.customer_name,
              rp.repair_no,
              to_char(rp.expected_done_at, 'YYYY-MM-DD') AS repair_expected_done_at,
              rp.repair_vendor,
              rp.status AS repair_status
       FROM serial_numbers sn
       LEFT JOIN stock_usages su   ON su.usage_no  = sn.usage_no
                                   AND su.status IN ('PENDING','COMPLETED')
                                   AND su.is_cancelled = 0
       LEFT JOIN storage ps        ON ps.storage_code = su.use_place_code
       LEFT JOIN employees e       ON e.man_no = su.use_man_no
       LEFT JOIN shipment_items si ON si.shipment_item_id = sn.shipment_item_id
       LEFT JOIN shipments sh      ON sh.shipment_id = si.shipment_id
       LEFT JOIN LATERAL (
         SELECT r.repair_no, r.expected_done_at, r.repair_vendor, r.status
         FROM repairs r
         WHERE r.serial_number_ids @> to_jsonb(sn.id)
           AND r.status IN ('REPORTED','REPAIRING')
         ORDER BY r.created_at DESC
         LIMIT 1
       ) rp ON true
       WHERE sn.item_code = $1
         ${usageNos ? `AND sn.usage_no = ANY($2)` : ''}
       ORDER BY sn.storage_code ASC NULLS LAST, sn.serial_no ASC`,
      usageNos ? [item_code, usageNos] : [item_code],
    );

    return rows.map(r => ({
      ...r,
      currentUser:          r.use_man_name ?? r.use_name ?? null,
      usageStatus:          r.usage_status ?? null,
      useUntil:             r.use_until ?? null,
      isIndefinite:         r.is_indefinite ?? null,
      // 사용처 표시명 — 외부면 직접입력 장소명, 창고면 창고명
      usePlace:             r.use_place_code === 'EXTERNAL'
                              ? (r.use_place_name ?? '외부')
                              : (r.use_place_storage_name ?? null),
      shipmentDestination:  r.customer_name ?? null,
      // 수리 진행 중이면 완료 예정일을 사용기한 자리에 보여준다
      repairNo:             r.repair_no ?? null,
      repairStatus:         r.repair_status ?? null,
      repairVendor:         r.repair_vendor ?? null,
      repairExpectedDoneAt: r.repair_expected_done_at ?? null,
    }));
  }

  /** 납품 품목의 S/N 목록
   *  - SHIPPED 이후: serial_numbers.shipment_item_id 로 조회
   *  - DRAFT(발송 전): shipment_items.serial_number_ids 배열로 fallback 조회
   */
  async findByShipmentItem(shipment_item_id: string) {
    // 발송 완료 후: S/N에 shipment_item_id가 세팅됨
    const byLink = await this.repo.find({ where: { shipment_item_id }, order: { serial_no: 'ASC' } });
    if (byLink.length > 0) return byLink;

    // DRAFT 상태: shipment_items의 serial_number_ids 배열로 조회
    const rows = await this.dataSource.query(
      `SELECT serial_number_ids FROM shipment_items WHERE shipment_item_id = $1`,
      [shipment_item_id],
    );
    const ids: number[] = rows[0]?.serial_number_ids ?? [];
    if (!ids.length) return [];
    return this.repo.find({ where: { id: In(ids) }, order: { serial_no: 'ASC' } });
  }

  /** S/N 정보 수정 (serial_no, asset_no, tags) */
  async updateOne(id: number, data: { serial_no?: string; asset_no?: string | null; tags?: Record<string, string> | null }) {
    const sn = await this.repo.findOne({ where: { id } });
    if (!sn) throw new Error('ERR_RES_001');
    if (data.serial_no !== undefined) sn.serial_no = data.serial_no;
    if (data.asset_no !== undefined) sn.asset_no = data.asset_no;
    if (data.tags !== undefined) sn.tags = data.tags;
    return this.repo.save(sn);
  }

  /** S/N 번호·장비번호 또는 태그 값으로 검색 (납품현황 필터용)
   *  WHERE 절을 하나의 andWhere 괄호로 묶어 OR/AND 우선순위 문제 방지 */
  search(q: string) {
    return this.repo.createQueryBuilder('sn')
      .where('(sn.serial_no ILIKE :q OR sn.asset_no ILIKE :q OR sn.tags::text ILIKE :q)', { q: `%${q}%` })
      .andWhere('sn.shipment_item_id IS NOT NULL')
      .orderBy('sn.serial_no', 'ASC')
      .getMany();
  }

  /** 특정 입고 건의 S/N 목록 */
  findByStoreItem(store_item_id: string) {
    return this.repo.find({ where: { store_item_id }, order: { serial_no: 'ASC' } });
  }

  /** 특정 사용 건의 S/N 목록
   *  반납/재사용으로 역참조(serial.usage_no)가 끊겨도 stock_usages.serial_number_ids로
   *  '무엇을 사용했는지'를 보존 표시. 구 데이터는 역참조로 폴백. */
  async findByUsage(usage_no: string) {
    const rows = await this.dataSource.query(
      `SELECT serial_number_ids FROM stock_usages WHERE usage_no = $1`, [usage_no],
    );
    const ids: number[] = rows[0]?.serial_number_ids ?? [];
    if (ids.length) {
      return this.repo.find({ where: { id: In(ids) }, order: { serial_no: 'ASC' } });
    }
    return this.repo.find({ where: { usage_no }, order: { serial_no: 'ASC' } });
  }
}
