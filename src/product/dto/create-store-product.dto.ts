import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, MaxLength, IsPositive, IsUUID } from 'class-validator';

export class CreateStoreProductDto {
  @ApiProperty({
    description: 'ID del producto del catálogo maestro',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  productId: string;

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
