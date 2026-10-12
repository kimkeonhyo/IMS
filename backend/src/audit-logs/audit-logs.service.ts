import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditLog } from './audit-log.entity';

interface LogParams {
  man_no: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';
  table_name: string;
  field?: string;
  old_value?: string;
  new_value?: string;
  ip_address?: string;
}

@Injectable()
export class AuditLogsService {
  async log(manager: EntityManager, params: LogParams): Promise<void> {
    const log = manager.create(AuditLog, {
      ...params,
      performed_at: new Date(),
    });
    await manager.save(AuditLog, log);
  }
}
