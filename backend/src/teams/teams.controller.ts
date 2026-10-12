import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Employee } from '../employees/employee.entity';

@ApiTags('teams')
@ApiBearerAuth('access-token')
@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @ApiOperation({ summary: '팀 목록 조회' })
  @Get()
  findAll() { return this.service.findAll(); }

  @ApiOperation({ summary: '팀 단건 조회' })
  @Get(':team_code')
  findOne(@Param('team_code') team_code: string) { return this.service.findOne(team_code); }

  @ApiOperation({ summary: '팀 등록' })
  @Post()
  @RequirePermission(Permission.TEAM_CREATE)
  create(@Body() dto: CreateTeamDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @ApiOperation({ summary: '팀 수정' })
  @Patch(':team_code')
  @RequirePermission(Permission.TEAM_UPDATE)
  update(@Param('team_code') team_code: string, @Body() dto: Partial<CreateTeamDto>, @CurrentUser() user: Employee) {
    return this.service.update(team_code, dto, user);
  }

  @ApiOperation({ summary: '팀 활성/비활성 토글' })
  @Patch(':team_code/toggle-active')
  @RequirePermission(Permission.TEAM_UPDATE)
  toggleActive(@Param('team_code') team_code: string, @CurrentUser() user: Employee) {
    return this.service.toggleActive(team_code, user);
  }
}
