import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Almacén Central' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Av. Principal 123' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+51 999 999 999' })
  @IsOptional()
  @IsString()
  phone?: string;
}
