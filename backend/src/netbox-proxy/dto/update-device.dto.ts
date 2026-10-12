import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** NetBox 장비 속성 수정 — 자주 쓰는 필드만 허용 (IP·인터페이스·케이블은 NetBox에서) */
export class UpdateNetboxDeviceDto {
  @ApiPropertyOptional({ description: '장비명' })
  @IsOptional() @IsString() @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ description: '시리얼' })
  @IsOptional() @IsString() @MaxLength(50)
  serial?: string;

  @ApiPropertyOptional({ description: '설명 (GPU 사양 등)' })
  @IsOptional() @IsString() @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: '상태', enum: ['active', 'offline', 'planned', 'staged', 'failed', 'inventory', 'decommissioning'] })
  @IsOptional() @IsIn(['active', 'offline', 'planned', 'staged', 'failed', 'inventory', 'decommissioning'])
  status?: string;

  @ApiPropertyOptional({ description: '역할 id' })
  @IsOptional() @IsInt()
  role?: number;

  @ApiPropertyOptional({ description: '담당팀(Owner) id — null이면 해제', nullable: true })
  @IsOptional() @IsInt()
  owner?: number | null;

  @ApiPropertyOptional({ description: '시작 U 위치 (1부터) — null이면 랙에서 내림', nullable: true })
  @IsOptional() @IsInt() @Min(1)
  position?: number | null;

  @ApiPropertyOptional({ description: '장착 면 (position 변경 시)', enum: ['front', 'rear'] })
  @IsOptional() @IsIn(['front', 'rear'])
  face?: 'front' | 'rear';

  @ApiPropertyOptional({ description: '장비 타입 id (U 높이 변경)' })
  @IsOptional() @IsInt()
  device_type?: number;

  @ApiPropertyOptional({ description: 'mgmt IP (CIDR 미기입 시 /16) — null이면 primary 해제', nullable: true })
  @IsOptional() @IsString() @MaxLength(43)
  mgmt_ip?: string | null;
}
