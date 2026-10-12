import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Team } from './team.entity';
import { CreateTeamDto } from './dto/create-team.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Employee } from '../employees/employee.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team) private readonly repo: Repository<Team>,
    @InjectRepository(Employee) private readonly empRepo: Repository<Employee>,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  /** 경영지원팀에게 팀 변경 알림 */
  private async notifyMgmtTeamTeam(teamName: string, changeType: string) {
    try {
      const appUrl = process.env.APP_URL ?? 'https://ims.example.com';
      const mgmtTeam = await this.empRepo.find({ where: { man_team: '경영지원팀', is_active: 1 } });
      for (const e of mgmtTeam) {
        if (e.email) void this.emailService.sendTeamChanged(e.email, e.name, teamName, changeType, appUrl);
      }
    } catch (_) { /* fire-and-forget */ }
  }

  findAll() {
    return this.repo.find({ order: { team_code: 'ASC' } });
  }

  async findOne(team_code: string) {
    const team = await this.repo.findOne({ where: { team_code } });
    if (!team) throw new NotFoundException('ERR_RES_001');
    return team;
  }

  async create(dto: CreateTeamDto, actor: Employee) {
    const exists = await this.repo.findOne({ where: { team_code: dto.team_code } });
    if (exists) throw new ConflictException('ERR_RES_002: 이미 존재하는 팀코드입니다');

    const saved = await this.dataSource.transaction(async (manager) => {
      const team = manager.create(Team, dto);
      const result = await manager.save(team);
      await this.auditLogs.log(manager, {
        man_no: actor.man_no, action: 'CREATE',
        table_name: 'teams', new_value: result.team_code,
      });
      return result;
    });
    void this.notifyMgmtTeamTeam(saved.team_name, '등록');
    return saved;
  }

  async update(team_code: string, dto: Partial<Omit<CreateTeamDto, 'team_code'>>, actor: Employee) {
    const team = await this.findOne(team_code);
    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(team, dto);
      const result = await manager.save(team);
      await this.auditLogs.log(manager, {
        man_no: actor.man_no, action: 'UPDATE',
        table_name: 'teams', new_value: team_code,
      });
      return result;
    });
    void this.notifyMgmtTeamTeam(saved.team_name, '수정');
    return saved;
  }

  async toggleActive(team_code: string, actor: Employee) {
    const team = await this.findOne(team_code);
    const saved = await this.dataSource.transaction(async (manager) => {
      team.is_active = team.is_active === 1 ? 0 : 1;
      const result = await manager.save(team);
      await this.auditLogs.log(manager, {
        man_no: actor.man_no, action: 'UPDATE',
        table_name: 'teams', new_value: `${team_code}:is_active=${team.is_active}`,
      });
      return result;
    });
    const changeType = saved.is_active === 1 ? '활성화' : '비활성화';
    void this.notifyMgmtTeamTeam(saved.team_name, changeType);
    return saved;
  }
}
