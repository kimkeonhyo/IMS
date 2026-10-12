import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Inventory } from './inventory.entity';
import { Employee } from '../employees/employee.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly repo: Repository<Inventory>,
  ) {}

  /** 재고 현황 목록
   *  - MASTER     : 전체 품목 (PUBLIC + PRIVATE, 창고 전체 수량)
   *  - ADMIN      : PUBLIC 전체 수량 + PRIVATE 중 본인 사용 등록 건(본인 할당 수량만)
   *  - USER       : PUBLIC 전체 수량 + PRIVATE 중 본인 사용 등록 건(본인 할당 수량만)
   *  - 사용 등록 없는 PRIVATE 품목 → MASTER에게만 표시
   */
  async findAll(user: Employee) {
    const qb = this.repo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.item', 'item')
      .leftJoinAndSelect('inv.storage', 'storage')
      .where('storage.is_active = 1')
      .andWhere('item.is_active = 1');

    if (user.man_roll !== 'MASTER') {
      qb.andWhere(
        `(item.visibility = 'PUBLIC' OR item.visibility IS NULL OR EXISTS (
          SELECT 1 FROM stock_usages su
          WHERE su.item_code = inv.item_code
            AND su.use_man_no = :userManNo
            AND su.status IN ('PENDING', 'COMPLETED')
            AND su.is_cancelled = 0
        ))`,
        { userManNo: user.man_no },
      );
    }

    const inventories = await qb.getMany();

    // MASTER가 아니면 PRIVATE 품목은 본인 할당 수량으로 교체
    if (user.man_roll !== 'MASTER') {
      const privateItems = inventories.filter(inv => inv.item?.visibility === 'PRIVATE');
      if (privateItems.length > 0) {
        const codes = [...new Set(privateItems.map(i => i.item_code))];
        const usageRows: Array<{ item_code: string; storage_code: string; qty: number }> =
          await this.repo.manager.query(
            `SELECT item_code, storage_code, SUM(quantity)::int AS qty
             FROM stock_usages
             WHERE use_man_no = $1
               AND status IN ('PENDING','COMPLETED')
               AND is_cancelled = 0
               AND item_code = ANY($2)
             GROUP BY item_code, storage_code`,
            [user.man_no, codes],
          );
        const usageMap = new Map(usageRows.map(u => [`${u.item_code}:${u.storage_code}`, u.qty]));

        return inventories.map(inv => {
          if (inv.item?.visibility !== 'PRIVATE') return inv;
          const allocated = usageMap.get(`${inv.item_code}:${inv.storage_code}`) ?? 0;
          return Object.assign(Object.create(Object.getPrototypeOf(inv)), inv, { quantity: allocated });
        });
      }
    }

    return inventories;
  }

  async findOne(storage_code: string, item_code: string) {
    const inv = await this.repo.findOne({
      where: { storage_code, item_code },
      relations: ['item', 'storage'],
    });
    if (!inv) throw new NotFoundException('ERR_INV_001');
    return inv;
  }

  /** 재고 증가 (입고 시 호출, 트랜잭션 내에서 사용) */
  async increaseQty(
    manager: EntityManager,
    storage_code: string,
    item_code: string,
    qty: number,
  ): Promise<void> {
    let inv = await manager.findOne(Inventory, { where: { storage_code, item_code } });
    if (!inv) {
      inv = manager.create(Inventory, { storage_code, item_code, quantity: 0 });
    }
    inv.quantity += qty;
    await manager.save(inv);
  }

  /** 재고 차감 (납품/사용 시 호출, 비관적 락 포함) */
  async decreaseQty(
    manager: EntityManager,
    storage_code: string,
    item_code: string,
    qty: number,
  ): Promise<void> {
    const inv = await manager
      .createQueryBuilder(Inventory, 'inv')
      .setLock('pessimistic_write')
      .where('inv.storage_code = :storage_code AND inv.item_code = :item_code', { storage_code, item_code })
      .getOne();

    if (!inv || inv.quantity < qty) {
      throw new Error(`ERR_INV_002: 재고 부족 (현재: ${inv?.quantity ?? 0}, 요청: ${qty})`);
    }
    inv.quantity -= qty;
    await manager.save(inv);
  }
}
