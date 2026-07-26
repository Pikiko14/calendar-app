import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BlockDto {
  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;
}

export class WorkerDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialtyIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  password?: string;

  /** Comisión % sobre ventas al completar citas. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPct?: number;
}

export class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialtyIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Acceso al panel (calendario). Requiere email + password al crear acceso. */
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPct?: number;
}

export class WorkerScheduleDto {
  @IsString()
  dayOfWeek!: string;

  @IsOptional()
  @IsBoolean()
  isOff?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockDto)
  blocks!: BlockDto[];
}

export class WeeklyScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerScheduleDto)
  days!: WorkerScheduleDto[];
}

export class TimeOffDto {
  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  type?: string;
}
