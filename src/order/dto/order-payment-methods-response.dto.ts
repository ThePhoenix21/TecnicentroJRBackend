import { ApiProperty } from '@nestjs/swagger';
import { PaymentType } from '@prisma/client';

export class OrderPaymentItemDto {
  @ApiProperty({ example: 'a1b2c3d4-5678-90ab-cdef-1234567890ab' })
  id: string;

  @ApiProperty({ enum: PaymentType })
  type: PaymentType;

  @ApiProperty({ example: 120.5 })
  amount: number;

  @ApiProperty({ example: '2026-02-04T01:15:00.000Z' })
  createdAt: Date;
}

export class OrderPaymentMethodsResponseDto {
  @ApiProperty({ example: '98f1114b-7a0f-4d8c-a32f-1c99c11567d9' })
  orderId: string;

  @ApiProperty({ example: 'A01-20260204-XYZ12345' })
  orderNumber: string;

  @ApiProperty({ example: 520.75 })
  totalAmount: number;

  @ApiProperty({ example: 300 })
  totalPaid: number;

  @ApiProperty({ example: 220.75 })
  pendingAmount: number;

  @ApiProperty({ type: OrderPaymentItemDto, isArray: true })
  payments: OrderPaymentItemDto[];
}
