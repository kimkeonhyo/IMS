import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';

export class MoveDeviceDto {
  @ApiProperty({ description: '이동할 NetBox 랙 ID' })
  @IsInt()
  rack: number;

  @ApiProperty({ description: '장비 하단 U 위치 (1부터)' })
  @IsInt()
  @Min(1)
  position: number;

  @ApiProperty({ description: '장착 면', enum: ['front', 'rear'] })
  @IsIn(['front', 'rear'])
  face: 'front' | 'rear';
}
