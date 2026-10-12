import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { DeliveriesService, CreateDeliveryDto } from './deliveries.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { Employee } from '../employees/employee.entity';

@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveriesController {
  constructor(private readonly service: DeliveriesService) {}

  @Get()
  findAll(@CurrentUser() user: Employee) { return this.service.findAll(user); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreateDeliveryDto, @CurrentUser() user: Employee) {
    return this.service.create(dto, user);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.start(id, user);
  }

  @Post(':id/deliver')
  deliver(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.deliver(id, user);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  approve(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.approve(id, user);
  }

  @Post(':id/consume')
  @Roles(Role.ADMIN)
  consume(@Param('id') id: string, @CurrentUser() user: Employee) {
    return this.service.consume(id, user);
  }
}
