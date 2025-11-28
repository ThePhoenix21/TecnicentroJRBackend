import { ApiProperty } from '@nestjs/swagger';
import { Product as PrismaProduct, User } from '@prisma/client';

export class CatalogProduct implements PrismaProduct {
  @ApiProperty({ description: 'ID único del producto', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ description: 'Nombre del producto', example: 'Aceite de motor 10W40' })
  name: string;

  @ApiProperty({ description: 'Descripción del producto', example: 'Aceite sintético para motor', required: false, nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Precio de venta sugerido (base)', example: 29.99, nullable: true })
  basePrice: number | null;

  @ApiProperty({ description: 'Costo de adquisición del producto (referencia)', example: 20.50, nullable: true })
  buyCost: number | null;

  @ApiProperty({ description: 'Indica si el producto está eliminado (soft delete)', example: false })
  isDeleted: boolean;

  @ApiProperty({ description: 'Fecha de creación', type: Date })
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización', type: Date })
  updatedAt: Date;

  @ApiProperty({ description: 'ID del usuario que creó el producto', example: '123e4567-e89b-12d3-a456-426614174000', nullable: true })
  createdById: string | null;

  @ApiProperty({ description: 'Usuario que creó el producto', required: false, nullable: true })
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;

  @ApiProperty({ description: 'Productos en tiendas', type: 'array', required: false })
  storeProducts?: any[];
}
