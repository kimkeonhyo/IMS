import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Delivery } from './delivery.entity';
import { DeliveryItem } from './delivery-item.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';
import { generateDocNo } from '../common/utils/doc-no.util';

export class CreateDeliveryDto {
  title: string;
  note?: string;
  items: { item_code: string; storage_code: string; quantity: number }[];
}

const TRANSITIONS: Record<string, string[]> = {
  PENDING:     ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DELIVERED'],
  DELIVERED:   ['APPROVED'],
  APPROVED:    ['CONSUMED'],
  CONSUMED:    [],
  CANCELLED:   [],
};

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectRepository(Delivery) private readonly repo: Repository<Delivery>,
    private readonly inventoryService: InventoryService,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  findAll(user: Employee) {
    const qb = this.repo.createQueryBuilder('dlv')
      .leftJoinAndSelect('dlv.items', 'items')
      .leftJoinAndSelect('dlv.deliveryMan', 'deliveryMan')
      .orderBy('dlv.created_at', 'DESC');

    if (user.man_team !== '경영지원팀' && user.man_roll !== 'MASTER') {
      qb.where('deliveryMan.man_team = :team', { team: user.man_team });
    }
    return qb.getMany();
  }

  async findOne(delivery_no: string) {
    const d = await this.repo.findOne({
      where: { delivery_no },
      relations: ['items', 'items.item', 'items.storage', 'deliveryMan', 'approver'],
    });
    if (!d) throw new NotFoundException('ERR_RES_001');
    return d;
  }

  async create(dto: CreateDeliveryDto, user: Employee) {
    return this.dataSource.transaction(async (manager) => {
      const delivery_no = await generateDocNo(this.dataSource, 'deliveries', 'delivery_no', 'DLV');
      const dlv = manager.create(Delivery, { delivery_no, title: dto.title, note: dto.note, status: 'PENDING', delivery_man_no: user.man_no });
      await manager.save(dlv);

      for (const i of dto.items) {
        await manager.save(manager.create(DeliveryItem, {
          delivery_item_id: uuidv4(), delivery_no, item_code: i.item_code, storage_code: i.storage_code, quantity: i.quantity,
        }));
      }

      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'CREATE', table_name: 'deliveries', new_value: delivery_no });
      return this.repo.findOne({ where: { delivery_no }, relations: ['items'] });
    });
  }

  async start(delivery_no: string, user: Employee) {
    return this.transition(delivery_no, 'IN_PROGRESS', user);
  }

  async deliver(delivery_no: string, user: Employee) {
    return this.transition(delivery_no, 'DELIVERED', user, async (_m, d) => {
      d.delivered_at = new Date();
    });
  }

  async approve(delivery_no: string, user: Employee) {
    return this.transition(delivery_no, 'APPROVED', user, async (manager, d) => {
      // 승인 시점에 품목별 재고 차감
      const items = await manager.find(DeliveryItem, { where: { delivery_no } });
      for (const item of items) {
        await this.inventoryService.decreaseQty(manager, item.storage_code, item.item_code, item.quantity);
      }
      d.approved_man_no = user.man_no;
      d.approved_at = new Date();
    });
  }

  async consume(delivery_no: string, user: Employee) {
    return this.transition(delivery_no, 'CONSUMED', user);
  }

  private async transition(
    delivery_no: string, toStatus: string, user: Employee,
    beforeSave?: (manager: any, d: Delivery) => Promise<void>,
  ) {
    const d = await this.repo.findOne({ where: { delivery_no } });
    if (!d) throw new NotFoundException('ERR_RES_001');
    if (!TRANSITIONS[d.status]?.includes(toStatus)) {
      throw new ConflictException(`ERR_FLOW_001: ${d.status} → ${toStatus} 전이 불가`);
    }
    return this.dataSource.transaction(async (manager) => {
      const old = d.status;
      if (beforeSave) await beforeSave(manager, d);
      d.status = toStatus;
      const saved = await manager.save(d);
      await this.auditLogs.log(manager, { man_no: user.man_no, action: 'STATUS_CHANGE', table_name: 'deliveries', field: 'status', old_value: old, new_value: toStatus });
      return saved;
    });
  }
}
