import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { Storage } from './storage.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';
import { EmailService } from '../email/email.service';

export class CreateStorageDto {
  @IsString() @IsNotEmpty()
  storage_code: string;

  @IsString() @IsNotEmpty()
  storage_name: string;

  @IsString() @IsOptional()
  location?: string;
}

export class UpdateStorageDto {
  @IsString() @IsOptional()
  storage_name?: string;

  @IsString() @IsOptional()
  location?: string;
}

@Injectable()
export class StorageService {
  constructor(
    @InjectRepository(Storage) private readonly repo: Repository<Storage>,
    @InjectRepository(Employee) private readonly empRepo: Repository<Employee>,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  /** 경영지원팀에게 창고 변경 알림 */
  private async notifyMgmtTeamStorage(storageName: string, changeType: string) {
    try {
      const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
      const mgmtTeam = await this.empRepo.find({ where: { man_team: '경영지원팀', is_active: 1 } });
      for (const e of mgmtTeam) {
        if (e.email) void this.emailService.sendStorageChanged(e.email, e.name, storageName, changeType, appUrl);
      }
    } catch (_) { /* fire-and-forget */ }
  }

  findAll() {
    return this.repo.find({ where: { is_active: 1 }, order: { storage_name: 'ASC' } });
  }

  async findOne(storage_code: string) {
    const s = await this.repo.findOne({ where: { storage_code } });
    if (!s) throw new NotFoundException('ERR_RES_001');
    return s;
  }

  async create(dto: CreateStorageDto, actor: Employee) {
    const exists = await this.repo.findOne({ where: { storage_code: dto.storage_code } });
    if (exists) throw new ConflictException('ERR_CONFLICT_001');

    const saved = await this.dataSource.transaction(async (manager) => {
      const s = manager.create(Storage, {
        storage_code: dto.storage_code,
        storage_name: dto.storage_name,
        location: dto.location,
      });
      const result = await manager.save(s);
      await this.auditLogs.log(manager, { man_no: actor.man_no, action: 'CREATE', table_name: 'storage', new_value: result.storage_code });
      return result;
    });
    void this.notifyMgmtTeamStorage(saved.storage_name, '등록');
    return saved;
  }

  async update(storage_code: string, dto: UpdateStorageDto, actor: Employee) {
    const s = await this.findOne(storage_code);
    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(s, dto);
      const result = await manager.save(s);
      await this.auditLogs.log(manager, { man_no: actor.man_no, action: 'UPDATE', table_name: 'storage', new_value: storage_code });
      return result;
    });
    void this.notifyMgmtTeamStorage(saved.storage_name, '수정');
    return saved;
  }

  async toggleActive(storage_code: string, actor: Employee) {
    const s = await this.findOne(storage_code);
    const saved = await this.dataSource.transaction(async (manager) => {
      s.is_active = s.is_active === 1 ? 0 : 1;
      const result = await manager.save(s);
      await this.auditLogs.log(manager, { man_no: actor.man_no, action: 'UPDATE', table_name: 'storage', new_value: storage_code });
      return result;
    });
    const changeType = saved.is_active === 1 ? '활성화' : '비활성화';
    void this.notifyMgmtTeamStorage(saved.storage_name, changeType);
    return saved;
  }
}
