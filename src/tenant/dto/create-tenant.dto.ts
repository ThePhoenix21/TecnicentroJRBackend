import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { TenantFeature, TenantPlan, TenantStatus } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ example: 'Tecnocentro JR', description: 'Nombre del tenant (empresa)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '20123456789', description: 'RUC del tenant (opcional)' })
  @IsOptional()
  @IsString()
  ruc?: string;

  @ApiPropertyOptional({ enum: TenantStatus, example: TenantStatus.ACTIVE })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiProperty({ enum: TenantPlan, example: TenantPlan.FREE, description: 'Plan del tenant' })
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @ApiProperty({
    enum: TenantFeature,
    isArray: true,
    description: 'Features habilitados para el tenant.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TenantFeature, { each: true })
  features: TenantFeature[];

  @ApiProperty({ example: 'admin@tecnocentrojr.com', description: 'Email del usuario administrador inicial' })
  @IsEmail()
  adminEmail: string;

  @ApiProperty({ example: 'Admin123*', description: 'Contraseña del usuario administrador inicial' })
  @IsString()
  @MinLength(6)
  adminPassword: string;

  @ApiProperty({ example: 'Administrador', description: 'Nombre del usuario administrador inicial' })
  @IsString()
  @IsNotEmpty()
  adminName: string;

  @ApiProperty({ example: 'admin.tecnocentrojr', description: 'Username del usuario administrador inicial' })
  @IsString()
  @IsNotEmpty()
  adminUsername: string;

  @ApiPropertyOptional({ example: 'sin_telefono', description: 'Teléfono del admin (opcional)' })
  @IsOptional()
  @IsString()
  adminPhone?: string;

  @ApiPropertyOptional({ example: 'Tienda Principal', description: 'Nombre de la tienda genérica inicial (opcional)' })
  @IsOptional()
  @IsString()
  storeName?: string;

  @ApiPropertyOptional({ example: 'Dirección por definir', description: 'Dirección de la tienda genérica inicial (opcional)' })
  @IsOptional()
  @IsString()
  storeAddress?: string;

  @ApiPropertyOptional({ example: '999999999', description: 'Teléfono de la tienda genérica inicial (opcional)' })
  @IsOptional()
  @IsString()
  storePhone?: string;
}
