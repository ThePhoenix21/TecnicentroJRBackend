import { ApiProperty } from '@nestjs/swagger';

export class StoreProductStockDto {
  @ApiProperty({ description: 'ID del producto en tienda (StoreProduct)', example: 'aff39e75-8200-4b94-b771-8f76b8e9ee2e' })
  id!: string;

  @ApiProperty({ description: 'ID del producto del catálogo asociado', example: '123e4567-e89b-12d3-a456-426614174000' })
  productId!: string;

  @ApiProperty({ description: 'Nombre del producto', example: 'Aceite de Motor 10W40' })
  name!: string;

  @ApiProperty({ description: 'Stock actual del producto en la tienda solicitada', example: 45 })
  stock!: number;
}
