import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, IsArray } from 'class-validator';
import { StockMovement } from './stock-movement.entity';
import { SerialNumber, SerialStatus } from '../serial-numbers/serial-number.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EmailService } from '../email/email.service';
import { Employee } from '../employees/employee.entity';
import { generateDocNo } from '../common/utils/doc-no.util';

export class CreateStockMovementDto {
  @IsString() @IsNotEmpty() item_code: string;
  @IsString() @IsNotEmpty() from_storage_code: string;
  @IsString() @IsNotEmpty() to_storage_code: string;
  @IsNumber() @Min(1) quantity: number;
  @IsOptional() @IsString() note?: string;
  /** S/N 관리 품목: 이동할 serial_number id 배열 */
  @IsOptional() @IsArray() serial_number_ids?: number[];
  @IsOptional() @IsString() to_man_no?: string;
}

@Injectable()
export class StockMovementsService {
  constructor(
    @InjectRepository(StockMovement) private readonly repo: Repository<StockMovement>,
    private readonly inventoryService: InventoryService,
    private readonly auditLogs: AuditLogsService,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
  ) {}

  findAll(user: Employee) {
    const qb = this.repo.createQueryBuilder('sm')
      .leftJoinAndSelect('sm.item', 'item')
      .leftJoinAndSelect('sm.fromStorage', 'fromStorage')
      .leftJoinAndSelect('sm.toStorage', 'toStorage')
      .leftJoinAndSelect('sm.mover', 'mover')
      .leftJoinAndSelect('sm.receiver', 'receiver')
      .orderBy('sm.created_at', 'DESC');

    // PRIVATE 품목: MASTER가 아니면 본인이 인계자 또는 인수자인 건만
    if (user.man_roll !== 'MASTER') {
      qb.andWhere(
        `(item.visibility = 'PUBLIC' OR item.visibility IS NULL
          OR sm.move_man_no = :u OR sm.to_man_no = :u)`,
        { u: user.man_no },
      );
    }
    return qb.getMany();
  }

  async findOne(movement_no: string) {
    const sm = await this.repo.findOne({
      where: { movement_no },
      relations: ['item', 'fromStorage', 'toStorage', 'mover', 'approver', 'receiver'],
    });
    if (!sm) throw new NotFoundException('ERR_RES_001');

    // 이동된 S/N 목록 첨부 (어떤 장비가 이동됐는지 상세에서 보여주기 위함)
    // serial_number_ids는 jsonb라 값이 문자열("386")로 저장돼 있을 수 있음 → 숫자로 강제 변환
    // (안 하면 정수 id 컬럼과 매칭되지 않아 빈 배열이 됨)
    const ids = (sm.serial_number_ids ?? [])
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n));
    const serials = ids.length
      ? await this.dataSource.getRepository(SerialNumber).find({
          where: { id: In(ids) },
          order: { serial_no: 'ASC' },
        })
      : [];
    return { ...sm, serials };
  }

  async create(dto: CreateStockMovementDto, user: Employee) {
    if (dto.from_storage_code === dto.to_storage_code) {
      throw new BadRequestException('ERR_VALID_006: 출발지와 도착지가 동일합니다');
    }

    // S/N 유효성 검증
    if (dto.serial_number_ids?.length) {
      if (dto.serial_number_ids.length !== dto.quantity) {
        throw new BadRequestException(
          `ERR_VALID_007: S/N 개수(${dto.serial_number_ids.length})와 수량(${dto.quantity})이 다릅니다.`,
        );
      }
      const serials = await this.dataSource.getRepository(SerialNumber).find({
        where: { id: In(dto.serial_number_ids) },
      });
      const invalid = serials.filter(
        sn => sn.status !== SerialStatus.STOCK || sn.storage_code !== dto.from_storage_code,
      );
      if (invalid.length) {
        throw new BadRequestException(
          `ERR_VALID_007: S/N [${invalid.map(s => s.serial_no).join(', ')}]은 출발 창고에 재고 상태가 아닙니다.`,
        );
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const movement_no = await generateDocNo(this.dataSource, 'stock_movements', 'movement_no', 'TRF');
      const sm = manager.create(StockMovement, {
        ...dto,
        movement_no,
        status: 'PENDING',
        move_man_no: user.man_no,
        serial_number_ids: dto.serial_number_ids ?? null,
        to_man_no: dto.to_man_no ?? undefined,
      });
      const saved = await manager.save(sm);
      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'CREATE', table_name: 'stock_movements', new_value: movement_no });

      // 인수자에게 이메일 알림
      if (dto.to_man_no) {
        const [receiver] = await this.dataSource.query(
          `SELECT email, name FROM employees WHERE man_no = $1`, [dto.to_man_no]
        );
        const [item] = await this.dataSource.query(
          `SELECT item_name FROM items WHERE item_code = $1`, [dto.item_code]
        );
        if (receiver?.email) {
          void this.emailService.sendStockMovementRequest(
            receiver.email, receiver.name, user.name,
            item?.item_name ?? dto.item_code, dto.quantity, movement_no,
          );
        }
      }

      return saved;
    });
  }

  async approve(movement_no: string, user: Employee) {
    const sm = await this.repo.findOne({ where: { movement_no } });
    if (!sm) throw new NotFoundException('ERR_RES_001');
    if (sm.status !== 'PENDING') throw new ConflictException('ERR_FLOW_001');

    return this.dataSource.transaction(async (manager) => {
      sm.status = 'APPROVED';
      sm.approved_man_no = user.man_no;
      sm.approved_at = new Date();
      const saved = await manager.save(sm);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'stock_movements',
        field: 'status', old_value: 'PENDING', new_value: 'APPROVED',
      });

      // 인계자에게 승인 알림
      const sm2 = await this.repo.findOne({ where: { movement_no }, relations: ['mover', 'item'] });
      if (sm2?.mover?.email) {
        void this.emailService.sendStockMovementApproved(
          sm2.mover.email, sm2.mover.name, user.name,
          sm2.item?.item_name ?? sm2.item_code, sm2.quantity, movement_no,
        );
      }

      return saved;
    });
  }

  /** APPROVED → MOVED: 재고 이동 + S/N storage_code 변경 */
  async move(movement_no: string, user: Employee) {
    const sm = await this.repo.findOne({ where: { movement_no } });
    if (!sm) throw new NotFoundException('ERR_RES_001');
    if (sm.status !== 'APPROVED') throw new ConflictException('ERR_FLOW_001: APPROVED 상태만 이동 처리 가능합니다');

    return this.dataSource.transaction(async (manager) => {
      await this.inventoryService.decreaseQty(manager, sm.from_storage_code, sm.item_code, sm.quantity);
      await this.inventoryService.increaseQty(manager, sm.to_storage_code, sm.item_code, sm.quantity);

      if (sm.serial_number_ids?.length) {
        await manager.update(
          SerialNumber,
          { id: In(sm.serial_number_ids) },
          { storage_code: sm.to_storage_code },
        );
      }

      sm.status = 'MOVED';
      sm.moved_at = new Date();
      const saved = await manager.save(sm);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'stock_movements',
        field: 'status', old_value: 'APPROVED', new_value: 'MOVED',
      });
      return saved;
    });
  }

  async cancel(movement_no: string, user: Employee) {
    const sm = await this.repo.findOne({ where: { movement_no } });
    if (!sm) throw new NotFoundException('ERR_RES_001');
    if (!['PENDING', 'APPROVED'].includes(sm.status)) {
      throw new ConflictException('ERR_FLOW_001: PENDING/APPROVED 상태만 취소 가능합니다');
    }
    return this.changeStatus(movement_no, sm.status, 'CANCELLED', user);
  }

  async reject(movement_no: string, user: Employee) {
    return this.changeStatus(movement_no, 'PENDING', 'CANCELLED', user);
  }

  private async changeStatus(movement_no: string, from: string, to: string, user: Employee) {
    const sm = await this.repo.findOne({ where: { movement_no } });
    if (!sm) throw new NotFoundException('ERR_RES_001');
    if (sm.status !== from) throw new ConflictException(`ERR_FLOW_001: ${sm.status} → ${to} 전이 불가`);
    return this.dataSource.transaction(async (manager) => {
      sm.status = to;
      const saved = await manager.save(sm);
      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'stock_movements', field: 'status', old_value: from, new_value: to });
      return saved;
    });
  }
}
