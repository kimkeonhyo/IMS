import { IsString, IsNotEmpty, IsOptional, IsEmail, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmployeeDto {
  @ApiPropertyOptional({
    description: '사번 — 미입력 시 자동 채번',
    example: 'EMP001',
  })
  @IsOptional() @IsString() @MaxLength(20)
  man_no?: string;

  @ApiProperty({ description: '로그인 아이디 (이메일 또는 아이디)', example: 'hong' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  man_id: string;

  @ApiProperty({ description: '이름', example: '홍길동' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  name: string;

  @ApiProperty({ description: '초기 비밀번호', example: '<TEMP_PASSWORD>' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  password: string;

  @ApiProperty({
    description: '역할',
    enum: ['MASTER', 'ADMIN', 'USER'],
    example: 'USER',
  })
  @IsIn(['MASTER', 'ADMIN', 'USER'])
  man_roll: string;

  @ApiProperty({ description: '소속 팀명', example: 'IT팀' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  man_team: string;

  @ApiProperty({ description: '이메일', example: 'hong@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: '연락처', example: '010-0000-0000' })
  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;
}
