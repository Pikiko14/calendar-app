import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
export class LoginDto { @IsEmail() email!: string; @IsString() @MinLength(8) password!: string; }
export class RegisterTenantDto extends LoginDto { @IsString() @IsNotEmpty() tenantName!: string; @IsString() @IsNotEmpty() slug!: string; @IsString() @IsNotEmpty() firstName!: string; @IsString() @IsNotEmpty() lastName!: string; @IsOptional() @IsString() phone?: string; }
export class RefreshDto { @IsString() refreshToken!: string; }
