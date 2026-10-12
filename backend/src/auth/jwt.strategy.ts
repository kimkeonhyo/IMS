import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly rolePermissions: RolePermissionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: { sub: string }) {
    const employee = await this.employeeRepo.findOne({
      where: { man_no: payload.sub },
    });
    if (!employee || !employee.is_active) {
      throw new UnauthorizedException('ERR_AUTH_001');
    }
    // 권한은 개인이 아니라 역할에 붙는다 — 화면·가드가 쓰는 값을 역할 권한으로 채운다
    employee.permissions = await this.rolePermissions.permissionsFor(employee.man_roll);
    return employee;
  }
}
