import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { RegistrationRequest } from './registration-request.entity';
import type { RegistrationStatus } from './registration-request.entity';
import { EmailService } from '../email/email.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import type { ApproveRegistrationDto } from './dto/approve-registration.dto';
import type { RejectRegistrationDto } from './dto/reject-registration.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(RegistrationRequest)
    private readonly registrationRepo: Repository<RegistrationRequest>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  /** Azure AD OIDC 로그인 URL 생성 */
  getOidcAuthUrl(): string {
    const params = new URLSearchParams({
      client_id:     process.env.AZURE_AD_CLIENT_ID!,
      response_type: 'code',
      redirect_uri:  `${process.env.APP_URL}/oidc/callback`,
      scope:         'openid email profile',
      response_mode: 'query',
    });
    return `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/authorize?${params}`;
  }

  /** Azure AD 인가 코드 → JWT 교환 (가입 승인 플로우 포함) */
  async handleOidcCallback(code: string): Promise<{ access_token: string; user: Omit<Employee, 'password'> }> {
    // 1. 코드 → 토큰 교환
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     process.env.AZURE_AD_CLIENT_ID!,
          client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
          code,
          redirect_uri:  `${process.env.APP_URL}/oidc/callback`,
          grant_type:    'authorization_code',
        }),
      },
    );

    const tokens = await tokenRes.json() as { id_token?: string; error?: string };
    if (!tokens.id_token) {
      this.logger.error('OIDC token exchange failed', tokens);
      throw new UnauthorizedException('ERR_AUTH_OIDC_001');
    }

    // 2. ID 토큰에서 이메일/이름 추출
    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString(),
    ) as { email?: string; preferred_username?: string; name?: string };

    const email = payload.email ?? payload.preferred_username;
    if (!email) throw new UnauthorizedException('ERR_AUTH_OIDC_002');

    const azureName = payload.name ?? email;

    // 3. employees 테이블 조회
    const employee = await this.employeeRepo.findOne({ where: { email } });

    if (employee) {
      if (!employee.is_active) {
        throw new UnauthorizedException('ERR_AUTH_OIDC_004');
      }
      // is_active=1: JWT 발급
      const token = this.jwtService.sign({ sub: employee.man_no });
      const { password: _, ...user } = employee;
      user.permissions = await this.rolePermissions.permissionsFor(employee.man_roll);
      return { access_token: token, user };
    }

    // 4. employees에 없음 → registration_requests 조회
    const existing = await this.registrationRepo.findOne({ where: { email } });

    if (existing) {
      if (existing.status === 'PENDING') {
        throw new UnauthorizedException('ERR_AUTH_OIDC_PENDING');
      }
      // REJECTED → 재신청: PENDING으로 리셋
      if (existing.status === 'REJECTED') {
        existing.status        = 'PENDING';
        existing.azure_name    = azureName;
        existing.reject_reason = null;
        existing.reviewed_by   = null;
        await this.registrationRepo.save(existing);
        await this.notifyAdmins(azureName, email);
        throw new UnauthorizedException('ERR_AUTH_OIDC_PENDING');
      }
    }

    // 5. 아무것도 없음 → 가입 신청 생성 + MASTER/ADMIN 이메일 알림
    await this.registrationRepo.save(
      this.registrationRepo.create({ email, azure_name: azureName, status: 'PENDING' }),
    );
    await this.notifyAdmins(azureName, email);

    throw new UnauthorizedException('ERR_AUTH_OIDC_PENDING');
  }

  /** MASTER / ADMIN 전원에게 가입 신청 알림 발송 */
  private async notifyAdmins(applicantName: string, applicantEmail: string): Promise<void> {
    const admins = await this.dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.man_roll IN (:...roles)', { roles: ['MASTER', 'ADMIN'] })
      .andWhere('e.is_active = :active', { active: 1 })
      .getMany();
    for (const admin of admins) {
      if (admin.email) {
        void this.emailService.sendRegistrationRequest(
          admin.email,
          admin.name,
          applicantName,
          applicantEmail,
        );
      }
    }
  }

  /** PENDING 가입 신청 목록 조회 — MASTER / ADMIN */
  async getRegistrationRequests(actor: Employee): Promise<RegistrationRequest[]> {
    if (actor.man_roll !== 'MASTER' && actor.man_roll !== 'ADMIN') {
      throw new ForbiddenException('MASTER 또는 ADMIN 권한이 필요합니다.');
    }
    return this.registrationRepo.find({
      where: { status: 'PENDING' as RegistrationStatus },
      order: { requested_at: 'ASC' },
    });
  }

  /** 가입 승인 — MASTER / ADMIN */
  async approveRegistration(
    id: string,
    dto: ApproveRegistrationDto,
    actor: Employee,
  ): Promise<Employee> {
    if (actor.man_roll !== 'MASTER' && actor.man_roll !== 'ADMIN') {
      throw new ForbiddenException('MASTER 또는 ADMIN 권한이 필요합니다.');
    }

    const request = await this.registrationRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException('가입 신청을 찾을 수 없습니다.');
    if (request.status !== 'PENDING') {
      throw new ConflictException('이미 처리된 가입 신청입니다.');
    }

    // man_no 자동채번
    const manNo = await this.generateManNo();

    // man_id = email prefix (중복 시 suffix 처리)
    const emailPrefix = request.email.split('@')[0];
    const manId = await this.generateManId(emailPrefix);

    // employee 생성 + 미가입자 재고사용 자동 연동을 하나의 트랜잭션으로 처리
    const savedEmployee = await this.dataSource.transaction(async (manager) => {
      const employee = manager.create(Employee, {
        man_no:      manNo,
        man_id:      manId,
        name:        request.azure_name,
        password:    null,
        man_roll:    dto.man_roll,
        man_team:    dto.man_team,
        email:       request.email,
        permissions: [],   // 권한은 역할에 붙는다 (role_permissions)
        is_active:   1,
      });
      const saved = await manager.save(employee);

      // 미가입자 재고사용 기록 자동 연동 (use_name이 동일한 이름인 경우)
      const linked = await manager.query(
        `UPDATE stock_usages
         SET use_man_no = $1, use_name = NULL
         WHERE use_man_no IS NULL
           AND use_name = $2
           AND is_cancelled = 0`,
        [manNo, request.azure_name],
      );
      if (linked.rowCount > 0) {
        this.logger.log(`미가입자 ${request.azure_name} → ${manNo} 재고사용 ${linked.rowCount}건 자동 연동`);
      }

      // registration_request 상태 업데이트
      request.status      = 'APPROVED';
      request.reviewed_by = actor.man_no;
      await manager.save(request);

      return saved;
    });

    // 신청자 이메일 알림
    void this.emailService.sendRegistrationApproved(request.email, request.azure_name);

    return savedEmployee;
  }

  /** 가입 반려 — MASTER / ADMIN */
  async rejectRegistration(
    id: string,
    dto: RejectRegistrationDto,
    actor: Employee,
  ): Promise<void> {
    if (actor.man_roll !== 'MASTER' && actor.man_roll !== 'ADMIN') {
      throw new ForbiddenException('MASTER 또는 ADMIN 권한이 필요합니다.');
    }

    const request = await this.registrationRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException('가입 신청을 찾을 수 없습니다.');
    if (request.status !== 'PENDING') {
      throw new ConflictException('이미 처리된 가입 신청입니다.');
    }

    request.status        = 'REJECTED';
    request.reject_reason = dto.reason ?? null;
    request.reviewed_by   = actor.man_no;
    await this.registrationRepo.save(request);

    // 신청자 이메일 알림
    void this.emailService.sendRegistrationRejected(request.email, request.azure_name, dto.reason);
  }

  /** man_no 자동채번: EMP-0001, EMP-0002, ... */
  private async generateManNo(): Promise<string> {
    const rows = await this.dataSource.query(
      `SELECT man_no FROM employees WHERE man_no LIKE $1 ORDER BY man_no DESC LIMIT 1`,
      ['EMP-%'],
    );
    let nextNum = 1;
    if (rows.length > 0) {
      const lastNum = parseInt((rows[0].man_no as string).split('-').pop() ?? '0', 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    return `EMP-${String(nextNum).padStart(4, '0')}`;
  }

  /** man_id 생성: 중복 시 _2, _3 suffix */
  private async generateManId(base: string): Promise<string> {
    const exists = await this.employeeRepo.findOne({ where: { man_id: base } });
    if (!exists) return base;

    let suffix = 2;
    while (true) {
      const candidate = `${base}_${suffix}`;
      const dup = await this.employeeRepo.findOne({ where: { man_id: candidate } });
      if (!dup) return candidate;
      suffix++;
    }
  }
}
