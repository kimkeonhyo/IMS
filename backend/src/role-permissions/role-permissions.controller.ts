import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolePermissionsService } from './role-permissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Employee } from '../employees/employee.entity';

@ApiTags('role-permissions')
@ApiBearerAuth('access-token')
@Controller('role-permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolePermissionsController {
  constructor(private readonly service: RolePermissionsService) {}

  @ApiOperation({ summary: '역할별 권한 목록' })
  @Get()
  @Roles(Role.MASTER)
  findAll() { return this.service.findAll(); }

  @ApiOperation({ summary: '역할 권한 수정' })
  @Patch(':role')
  @Roles(Role.MASTER)
  update(
    @Param('role') role: string,
    @Body('permissions') permissions: string[],
    @CurrentUser() user: Employee,
  ) {
    return this.service.update(role, permissions ?? [], user);
  }
}
