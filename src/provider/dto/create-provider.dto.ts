import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateProviderDto {
  @ApiPropertyOptional({ example: '20123456789' })
  @IsOptional()
  @IsString()
  ruc?: string;

  @ApiProperty({ example: 'Proveedor SAC' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '+51 999 999 999' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'contacto@proveedor.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Av. Principal 123' })
  @IsOptional()
  @IsString()
  address?: string;
}
