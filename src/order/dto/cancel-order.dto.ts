import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { PaymentType } from '@prisma/client';

export class CancelOrderPaymentMethodDto {
  @IsEnum(PaymentType)
  type: PaymentType;

  @IsNumber()
  @Min(0)
  amount: number;
}

export class CancelOrderDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancelOrderPaymentMethodDto)
  paymentMethods?: CancelOrderPaymentMethodDto[];
}
