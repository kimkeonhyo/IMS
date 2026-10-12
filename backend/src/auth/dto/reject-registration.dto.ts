import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectRegistrationDto {
  @ApiProperty({ example: '조직원이 아닙니다', required: false })
  @IsString()
  @IsOptional()
  reason?: string;
}
