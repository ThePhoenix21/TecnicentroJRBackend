import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({ example: 'Pedro Vendedor' })
  sellerName!: string;

  @ApiProperty({ type: [OrderListProductDto] })
  products!: OrderListProductDto[];

  @ApiProperty({ type: [OrderListServiceDto] })
  services!: OrderListServiceDto[];

  @ApiProperty({ enum: SaleStatus })
  status!: SaleStatus;

  @ApiProperty({ type: [OrderListPaymentMethodDto] })
  paymentMethods!: OrderListPaymentMethodDto[];
}
