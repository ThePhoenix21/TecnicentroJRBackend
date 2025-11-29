import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, MaxLength, IsPositive, IsUUID, IsBoolean } from 'class-validator';

export class CreateStoreProductDto {
  @ApiProperty({
    description: 'ID del producto del catálogo maestro (si el producto ya existe)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false
  })
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiProperty({
    description: 'Indica si se debe crear un nuevo producto en el catálogo',
    example: false,
    default: false,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  createNewProduct?: boolean = false;

  // Campos para crear nuevo producto (solo si createNewProduct es true)
  @ApiProperty({
    description: 'Nombre del nuevo producto (solo si createNewProduct es true)',
    example: 'Aceite de Motor 10W40',
    maxLength: 100,
    required: false
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Descripción del nuevo producto (solo si createNewProduct es true)',
    example: 'Aceite sintético de alta calidad para motores',
    maxLength: 500,
    required: false
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Precio base del nuevo producto (solo si createNewProduct es true)',
    example: 29.99,
    minimum: 0,
    required: false
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  basePrice?: number;

  @ApiProperty({
    description: 'Costo de compra del nuevo producto (solo si createNewProduct es true)',
    example: 20.50,
    minimum: 0,
    required: false
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  buyCost?: number;

  // Campos para el stock de tienda (siempre requeridos)
  @ApiProperty({
    description: 'ID de la tienda donde se registrará el producto',
    example: '456e7890-e12b-34d5-a678-426614174000'
  })
  @IsUUID()
  storeId: string;

  @ApiProperty({
    description: 'Precio de venta del producto en esta tienda',
    example: 29.99,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({
    description: 'Cantidad en inventario para esta tienda',
    example: 50,
    default: 0,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  stock: number = 0;

  @ApiProperty({
    description: 'Umbral mínimo de inventario para alertas en esta tienda',
    example: 5,
    default: 1,
    minimum: 0
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  stockThreshold: number = 1;
}
