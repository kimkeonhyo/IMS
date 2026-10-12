import { IsString, IsNotEmpty, IsOptional, IsIn, IsNumber, Min, MaxLength, IsEnum, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ItemCategory } from '../item.entity';

export class CreateItemDto {
  // item_code는 서버에서 자동 채번 — 클라이언트에서 받지 않음

  @IsEnum(ItemCategory)
  category: ItemCategory;

  @IsString() @IsNotEmpty() @MaxLength(200)
  item_name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsIn(['EA', 'BOX', 'SET', 'KG', 'L'])
  unit?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  unit_price?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  use_serial?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  specs?: string[];

  @IsOptional() @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: string;
}
