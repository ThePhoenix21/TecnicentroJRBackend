import { ApiProperty } from '@nestjs/swagger';

export class Product {
  @ApiProperty({ description: 'ID único del producto', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ description: 'Nombre del producto', example: 'Aceite de motor 10W40' })
  name: string;

  @ApiProperty({ description: 'Descripción del producto', example: 'Aceite sintético para motor', required: false, nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Precio del producto', example: 29.99 })
  price: number;

  @ApiProperty({ description: 'Costo de compra del producto', example: 20.50 })
  buycost: number;

  @ApiProperty({ description: 'Cantidad en inventario', example: 50 })
  stock: number;

  @ApiProperty({ description: 'Umbral mínimo de inventario para alertas', example: 5, default: 1 })
  stockTreshold: number;

  @ApiProperty({ description: 'Fecha de creación', type: Date })
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización', type: Date })
  updatedAt: Date;

  @ApiProperty({ description: 'ID del usuario propietario', example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;
}
