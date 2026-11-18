import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { FamilyManageRequest } from '@shared/api.interface';

export class FamilyManageDto implements FamilyManageRequest {
  @IsString()
  @IsIn(['create', 'disable'])
  action!: 'create' | 'disable';

  @IsOptional()
  @IsString()
  @MaxLength(20)
  familyName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['spouse', 'child', 'elder', 'other'])
  relation?: 'spouse' | 'child' | 'elder' | 'other';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  familyId?: number;
}
