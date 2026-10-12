import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseRequestItemDto {
  @IsString() @IsNotEmpty() @MaxLength(50)
  item_code: string;

  @IsOptional() @IsString() @MaxLength(36)
  storage_code?: string;

  @IsNumber() @Min(1)
  quantity: number;

  @IsOptional() @IsNumber() @Min(0)
  unit_price?: number;

  @IsOptional() @IsString() @MaxLength(200)
  spec?: string;        // 규격

  @IsOptional() @IsString() @MaxLength(200)
  supplier?: string;

  @IsOptional() @IsString()
  note?: string;
}

export class CreatePurchaseRequestDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  title: string;

  @IsOptional() @IsString()
  note?: string;         // 목적 (description)

  @IsOptional() @IsString()
  background?: string;   // 추진배경

  @IsOptional() @IsString() @MaxLength(200)
  supplier?: string;     // 거래처

  @IsOptional() @IsString() @MaxLength(50)
  fund_source?: string;   // 자체자금 | 정부사업 | 투자금

  @IsOptional() @IsString() @MaxLength(300)
  fund_budget?: string;   // 소요예산 (정부사업 시)

  @IsOptional() @IsString() @MaxLength(300)
  fund_project?: string;  // 정부사업명

  @IsOptional() @IsString() @MaxLength(500)
  flex_link?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => CreatePurchaseRequestItemDto)
  items: CreatePurchaseRequestItemDto[];
}
