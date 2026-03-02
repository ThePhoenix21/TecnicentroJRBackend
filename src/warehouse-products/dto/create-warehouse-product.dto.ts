import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, IsNumber } from 'class-validator';

export class CreateWarehouseProductDto {
  @ApiPropertyOptional({
    description: 'ID del producto del catálogo maestro (si el producto ya existe)',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Indica si se debe crear un nuevo producto en el catálogo',
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  createNewProduct?: boolean = false;

  @ApiPropertyOptional({
    description: 'Nombre del nuevo producto (solo si createNewProduct es true)',
    maxLength: 100,
    required: false,
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Descripción del nuevo producto (solo si createNewProduct es true)',
    maxLength: 500,
    required: false,
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Precio base del nuevo producto (solo si createNewProduct es true)',
    minimum: 0,
    required: false,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  basePrice?: number;

  @ApiPropertyOptional({
    description: 'Costo de compra del nuevo producto (solo si createNewProduct es true)',
    minimum: 0,
    required: false,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  buyCost?: number;

  @ApiPropertyOptional({ description: 'Stock inicial', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ description: 'Umbral de stock', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockThreshold?: number;
}
