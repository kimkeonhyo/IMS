import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { RolePermissionsService } from '../../role-permissions/role-permissions.service';
import { Role } from '../enums/role.enum';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string>(PERMISSION_KEY, context.getHandler());
    if (!required) return true;

    const user = context.switchToHttp().getRequest().user;
    if (!user) return false;

    // MASTER는 모든 권한 보유 (설정 실수로 잠기지 않도록)
    if (user.man_roll === Role.MASTER) return true;

    if (!(await this.rolePermissions.has(user.man_roll, required))) {
      throw new ForbiddenException(`ERR_PERM_001: 권한 없음 (${required})`);
    }
    return true;
  }
}
