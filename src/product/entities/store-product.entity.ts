import { ApiProperty } from '@nestjs/swagger';

export class StoreProduct {
  @ApiProperty({ description: 'ID único del producto en tienda', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ description: 'Precio de venta del producto en esta tienda', example: 29.99 })
  price: number;

  @ApiProperty({ description: 'Cantidad en inventario para esta tienda', example: 50 })
  stock: number;

  @ApiProperty({ description: 'Umbral mínimo de inventario para alertas en esta tienda', example: 5, default: 1 })
  stockThreshold: number;

  @ApiProperty({ description: 'Fecha de creación', type: Date })
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización', type: Date })
  updatedAt: Date;

  @ApiProperty({ description: 'ID del producto del catálogo maestro', example: '456e7890-e12b-34d5-a678-426614174000' })
  productId: string;

  @ApiProperty({ description: 'Información del producto del catálogo', required: false })
  product?: {
    id: string;
    name: string;
    description: string | null;
    basePrice: number | null;
    buyCost: number | null;
  };

  @ApiProperty({ description: 'ID de la tienda', example: '789e0123-e45b-67c8-a901-426614174000' })
  storeId: string;

  @ApiProperty({ description: 'Información de la tienda', required: false })
  store?: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
  };

  @ApiProperty({ description: 'ID del usuario responsable', example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ description: 'Información del usuario responsable', required: false })
  user?: {
    id: string;
    name: string;
    email: string;
  };
}
