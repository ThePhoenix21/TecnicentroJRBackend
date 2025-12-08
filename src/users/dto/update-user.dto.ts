import { 
  IsString, 
  MinLength,
  IsOptional, 
  IsEmail, 
  IsDateString, 
  IsEnum, 
  IsBoolean,
  IsUUID,
  IsArray
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsDateString()
  birthdate?: Date;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  // Permisos granulares del usuario (solo deberían ser gestionados por ADMIN)
  @IsOptional()
  @IsArray()
  permissions?: string[];
}