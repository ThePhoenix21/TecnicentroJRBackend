import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentDto } from './complete-order.dto';

export class PayOrderPaymentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments: PaymentDto[];
}
