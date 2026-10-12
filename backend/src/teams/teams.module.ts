import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Team } from './team.entity';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Employee } from '../employees/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Team, Employee]), AuditLogsModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
