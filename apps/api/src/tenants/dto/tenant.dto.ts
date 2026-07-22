import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsNumber,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mapUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  minBookingNoticeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  maxBookingDaysAhead?: number;

  @IsOptional()
  @IsBoolean()
  allowOnlineBooking?: boolean;

  @IsOptional()
  @IsBoolean()
  autoConfirm?: boolean;
}
