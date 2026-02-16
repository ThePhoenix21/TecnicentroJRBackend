import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentType, SaleStatus } from '@prisma/client';

export class OrderListPaymentMethodDto {
  @ApiProperty({ enum: PaymentType })
  type!: PaymentType;

  @ApiProperty({ example: 50 })
  amount!: number;
}

export class OrderListProductDto {
  @ApiProperty({ example: 'Aceite 20W50' })
  name!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: '100' })
  price!: string;
}

export class OrderListServiceDto {
  @ApiProperty({ example: 'Cambio de aceite' })
  name!: string;

  @ApiProperty({ example: 50 })
  price!: number;
}

export class ListOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '2026-02-01T10:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: 'Juan Pérez' })
  clientName!: string;

  @ApiPropertyOptional({ example: 'Pedro Vendedor' })
  sellerName?: string;

  @ApiProperty({ example: 333 })
  total!: number;

  @ApiProperty({ type: [OrderListProductDto] })
  products!: OrderListProductDto[];

  @ApiProperty({ type: [OrderListServiceDto] })
  services!: OrderListServiceDto[];

  @ApiProperty({ enum: SaleStatus })
  status!: SaleStatus;

  @ApiProperty({ type: [OrderListPaymentMethodDto] })
  paymentMethods!: OrderListPaymentMethodDto[];

  @ApiProperty({ type: [OrderListPaymentMethodDto] })
  refundPaymentMethods!: OrderListPaymentMethodDto[];
}
