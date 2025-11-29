import { IsString, IsArray, IsOptional, ValidateNested, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType } from '@prisma/client';

export class ServicePaymentDto {
  @IsString()
  serviceId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments: PaymentDto[];
}

export class PaymentDto {
  @IsEnum(PaymentType)
  type: PaymentType;

  @IsNumber()
  amount: number;
}

export class CompleteOrderDto {
  @IsString()
  orderId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServicePaymentDto)
  services: ServicePaymentDto[];
}
