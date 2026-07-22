import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TimeBlockDto {
  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;
}

export class BranchDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsBoolean()
  isMain?: boolean;
}

export class ScheduleDto {
  @IsString()
  dayOfWeek!: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeBlockDto)
  blocks!: TimeBlockDto[];
}

export class WeeklyBranchScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDto)
  days!: ScheduleDto[];
}
