import {
  Controller, Get, Post, Patch,
  Param, Body, UseGuards,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '../common/enums/permission.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { Employee } from './employee.entity';

@ApiTags('employees')
@ApiBearerAuth('access-token')
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @ApiOperation({ summary: '직원 목록 조회 (관리용)' })
  @Get()
  @Roles(Role.ADMIN)
  findAll() { return this.service.findAll(); }

  @ApiOperation({ summary: '활성 직원 목록 (드롭다운용, 모든 로그인 사용자 접근 가능)' })
  @Get('active')
  findActiveList() { return this.service.findActiveList(); }

  @ApiOperation({ summary: '직원 단건 조회' })
  @Get(':man_no')
  @Roles(Role.ADMIN)
  findOne(@Param('man_no') man_no: string) { return this.service.findOne(man_no); }

  @ApiOperation({ summary: '직원 등록' })
  @Post()
  @RequirePermission(Permission.EMPLOYEE_CREATE)
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @ApiOperation({ summary: '직원 정보 수정' })
  @Patch(':man_no')
  @RequirePermission(Permission.EMPLOYEE_UPDATE)
  update(@Param('man_no') man_no: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() user: Employee) {
    return this.service.update(man_no, dto, user);
  }

  @ApiOperation({ summary: '직원 활성/비활성 토글' })
  @Patch(':man_no/toggle-active')
  @Roles(Role.MASTER)
  toggleActive(@Param('man_no') man_no: string, @CurrentUser() user: Employee) {
    return this.service.toggleActive(man_no, user);
  }

  @ApiOperation({ summary: 'CSV/Excel 직원 일괄 등록' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'CSV 또는 Excel 파일 (.csv / .xlsx)' },
      },
    },
  })
  @Post('import')
  @Roles(Role.MASTER)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: Employee,
  ) {
    if (!file) throw new BadRequestException('파일이 없습니다');
    return this.service.importFromFile(file.buffer, file.mimetype, user);
  }
}
