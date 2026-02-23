import { ApiProperty } from '@nestjs/swagger';

class StoreProductDetailProductDto {
  @ApiProperty({ description: 'ID del producto del catálogo', example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ description: 'Nombre del producto del catálogo', example: 'Adaptador Opalux' })
  name!: string;

  @ApiProperty({ description: 'Descripción del producto', example: 'Adaptador multipuerto', nullable: true })
  description!: string | null;

  @ApiProperty({ description: 'Precio base sugerido', example: 18, nullable: true })
  basePrice!: number | null;

  @ApiProperty({ description: 'Costo de compra', example: 9, nullable: true })
  buyCost!: number | null;
}

class StoreProductDetailStoreDto {
  @ApiProperty({ description: 'Nombre de la tienda', example: 'Leguia' })
  name!: string;

  @ApiProperty({ description: 'Dirección de la tienda', example: 'Jr. Leguia 308', nullable: true })
  address!: string | null;

  @ApiProperty({ description: 'Teléfono de la tienda', example: '985781500', nullable: true })
  phone!: string | null;
}

class StoreProductDetailUserDto {
  @ApiProperty({ description: 'Nombre del usuario responsable', example: 'Alex Mantilla', nullable: true })
  name!: string | null;
}

export class StoreProductDetailDto {
  @ApiProperty({ description: 'ID del producto en tienda', example: '7b931de2-442c-4c43-b5ab-c9ce64dc6d8b' })
  id!: string;

  @ApiProperty({ description: 'Precio de venta en la tienda', example: 15 })
  price!: number;

  @ApiProperty({ description: 'Unidades disponibles en la tienda', example: 10 })
  stock!: number;

  @ApiProperty({ description: 'Umbral de alerta de stock en la tienda', example: 3 })
  stockThreshold!: number;

  @ApiProperty({ type: StoreProductDetailProductDto })
  product!: StoreProductDetailProductDto;

  @ApiProperty({ type: StoreProductDetailStoreDto })
  store!: StoreProductDetailStoreDto;

  @ApiProperty({ type: StoreProductDetailUserDto })
  user!: StoreProductDetailUserDto;
}
