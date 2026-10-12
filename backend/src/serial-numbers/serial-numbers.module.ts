import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SerialNumber } from './serial-number.entity';
import { SerialNumbersController } from './serial-numbers.controller';
import { SerialNumbersService } from './serial-numbers.service';

@Module({
  imports: [TypeOrmModule.forFeature([SerialNumber])],
  controllers: [SerialNumbersController],
  providers: [SerialNumbersService],
  exports: [SerialNumbersService],
})
export class SerialNumbersModule {}
