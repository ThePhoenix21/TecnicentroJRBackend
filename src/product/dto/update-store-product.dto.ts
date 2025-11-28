import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, IsPositive, IsUUID } from 'class-validator';

export class UpdateStoreProductDto {
  @ApiProperty({
    description: 'Precio de venta del producto en esta tienda',
    example: 29.99,
    minimum: 0,
    required: false
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @ApiProperty({
    description: 'Cantidad en inventario para esta tienda',
    example: 50,
    minimum: 0,
    required: false
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @ApiProperty({
    description: 'Umbral mínimo de inventario para alertas en esta tienda',
    example: 5,
    minimum: 0,
    required: false
  })
  @IsNumber()
  @IsOptional()
  @IsPositive()
  stockThreshold?: number;

  @ApiProperty({
    description: 'ID del producto del catálogo maestro',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false
  })
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiProperty({
    description: 'ID de la tienda donde está registrado el producto',
    example: '456e7890-e12b-34d5-a678-426614174000',
    required: false
  })
  @IsUUID()
  @IsOptional()
  storeId?: string;
}
