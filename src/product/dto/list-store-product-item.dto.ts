import { ApiProperty } from '@nestjs/swagger';

export class ListStoreProductItemDto {
  @ApiProperty({ description: 'ID del producto en tienda (StoreProduct)', example: 'aff39e75-8200-4b94-b771-8f76b8e9ee2e' })
  id!: string;

  @ApiProperty({ description: 'Nombre del producto', example: 'Adaptador Opalux' })
  name!: string;

  @ApiProperty({ description: 'Precio de venta (StoreProduct.price)', example: 15 })
  price!: number;

  @ApiProperty({ description: 'Unidades disponibles (StoreProduct.stock)', example: 10 })
  stock!: number;

  @ApiProperty({ description: 'Costo de compra (Product.buyCost)', example: 8 })
  buyCost!: number | null;

  @ApiProperty({ description: 'Precio sugerido (Product.basePrice)', example: 12 })
  basePrice!: number | null;
}
