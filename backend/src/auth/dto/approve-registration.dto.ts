import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 권한은 역할(man_roll)에 따라 정해지므로 승인 시 개별 지정하지 않는다 */
export class ApproveRegistrationDto {
  @ApiProperty({ example: 'IT팀', description: '소속팀' })
  @IsString()
  man_team: string;

  @ApiProperty({ example: 'USER', enum: ['MASTER', 'ADMIN', 'USER'] })
  @IsString()
  @IsIn(['MASTER', 'ADMIN', 'USER'])
  man_roll: string;
}
