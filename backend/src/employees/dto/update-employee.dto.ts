import { IsString, IsOptional, IsEmail, IsIn, MaxLength, IsNumber, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ description: '이름', example: '홍길동' })
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: '역할',
    enum: ['MASTER', 'ADMIN', 'USER'],
    example: 'ADMIN',
  })
  @IsOptional() @IsIn(['MASTER', 'ADMIN', 'USER'])
  man_roll?: string;

  @ApiPropertyOptional({ description: '소속 팀명', example: 'IT팀' })
  @IsOptional() @IsString() @MaxLength(50)
  man_team?: string;

  @ApiPropertyOptional({ description: '이메일', example: 'hong@example.com' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: '연락처', example: '010-0000-0000' })
  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: '활성 여부 (1: 활성, 0: 비활성)', example: 1 })
  @IsOptional() @IsNumber()
  is_active?: number;

  @ApiPropertyOptional({ description: '비밀번호 변경', example: 'NewPass1234!' })
  @IsOptional() @IsString() @MaxLength(100)
  password?: string;

  @ApiPropertyOptional({
    description: '권한 키 배열',
    example: ['pr:create', 'po:confirm', 'store:receive', 'shipment:ship'],
    type: [String],
  })
  @IsOptional() @IsArray()
  permissions?: string[];
}
