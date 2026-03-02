import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateWarehouseProductDto {
  @ApiPropertyOptional({ description: 'Stock del producto en el almacén' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ description: 'Umbral de stock' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockThreshold?: number;

  @ApiPropertyOptional({ description: 'Nombre del producto (catálogo)', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Descripción del producto (catálogo)', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Precio base del producto (catálogo)', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({ description: 'Costo de compra del producto (catálogo)', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  buyCost?: number;
}
