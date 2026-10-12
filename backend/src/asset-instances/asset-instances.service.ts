import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import type { AssetStatus } from './asset-instance.entity';
import { AssetInstance } from './asset-instance.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';

export class CreateAssetInstanceDto {
  @IsString() @IsNotEmpty() item_code: string;
  @IsString() @IsNotEmpty() serial_no: string;
  @IsString() @IsNotEmpty() storage_code: string;
  @IsOptional() @IsString() acquired_at?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateAssetInstanceDto {
  @IsOptional() @IsString() storage_code?: string;
  @IsOptional() @IsIn(['IN_STOCK', 'IN_USE', 'DISPOSED']) status?: AssetStatus;
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class AssetInstancesService {
  constructor(
    @InjectRepository(AssetInstance) private readonly repo: Repository<AssetInstance>,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  findAll(item_code?: string) {
    const qb = this.repo.createQueryBuilder('ai')
      .leftJoinAndSelect('ai.item', 'item')
      .leftJoinAndSelect('ai.storage', 'storage')
      .leftJoinAndSelect('ai.registeredBy', 'registeredBy')
      .orderBy('ai.created_at', 'DESC');
    if (item_code) qb.where('ai.item_code = :item_code', { item_code });
    return qb.getMany();
  }

  async findOne(asset_id: string) {
    const a = await this.repo.findOne({
      where: { asset_id },
      relations: ['item', 'storage', 'registeredBy'],
    });
    if (!a) throw new NotFoundException('ERR_RES_001');
    return a;
  }

  async create(dto: CreateAssetInstanceDto, user: Employee) {
    const dup = await this.repo.findOne({ where: { serial_no: dto.serial_no } });
    if (dup) throw new ConflictException('ERR_CONFLICT_001: 이미 등록된 시리얼넘버입니다');

    return this.dataSource.transaction(async (manager) => {
      const asset = manager.create(AssetInstance, {
        asset_id: uuidv4(),
        ...dto,
        acquired_at: dto.acquired_at ?? null,
        note: dto.note ?? null,
        status: 'IN_STOCK',
        man_no: user.man_no,
      });
      const saved = await manager.save(asset);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'CREATE',
        table_name: 'asset_instances', new_value: saved.asset_id,
      });
      return saved;
    });
  }

  async update(asset_id: string, dto: UpdateAssetInstanceDto, user: Employee) {
    const a = await this.findOne(asset_id);
    return this.dataSource.transaction(async (manager) => {
      Object.assign(a, dto);
      const saved = await manager.save(a);
      await this.auditLogs.log(manager, {
        man_no: user.man_no, action: 'UPDATE',
        table_name: 'asset_instances', new_value: asset_id,
      });
      return saved;
    });
  }
}
