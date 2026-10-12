import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

const ROLE_LEVEL: Record<Role, number> = {
  [Role.MASTER]: 0,
  [Role.ADMIN]: 1,
  [Role.USER]: 2,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    const userLevel = ROLE_LEVEL[user.man_roll as Role];

    // 요구 역할 중 하나라도 userLevel 이하면 통과
    return requiredRoles.some((role) => ROLE_LEVEL[role] >= userLevel);
  }
}
