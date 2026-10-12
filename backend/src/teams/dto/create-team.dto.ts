import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateTeamDto {
  @IsString() @IsNotEmpty() @MaxLength(50)
  team_code: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  team_name: string;

  @IsOptional() @IsString()
  description?: string;
}
