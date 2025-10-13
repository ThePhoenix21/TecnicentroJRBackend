import { ApiProperty } from '@nestjs/swagger';
import { Sale as PrismaSale, SaleStatus } from '@prisma/client';

export class Sale implements PrismaSale {
  @ApiProperty({
    description: 'ID único de la venta',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  id: string;

  @ApiProperty({
    description: 'ID del producto vendido',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  productId: string;

  @ApiProperty({
    description: 'ID del usuario que realizó la venta',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  userId: string;

  @ApiProperty({
    description: 'Cantidad de productos vendidos',
    example: 2
  })
  quantity: number;

  @ApiProperty({
    description: 'Monto total de la venta',
    example: 199.99
  })
  totalAmount: number;

  @ApiProperty({
    description: 'Fecha de creación de la venta',
    example: '2023-01-01T00:00:00.000Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Fecha de última actualización de la venta',
    example: '2023-01-01T00:00:00.000Z'
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Estado de la venta',
    enum: SaleStatus,
    example: SaleStatus.COMPLETED
  })
  status: SaleStatus;
}
