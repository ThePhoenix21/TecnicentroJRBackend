import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsUUID, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType } from '../enums/payment-type.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { ServiceType } from '../enums/service-type.enum';

export class PaymentDto {
  @IsEnum(PaymentType)
  type: PaymentType;

  @IsNumber()
  @Min(0)
  amount: number;
}

export class ClientInfoDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  dni: string;

  @IsString()
  @IsOptional()
  ruc?: string;
}

export class ProductDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  @IsOptional()
  customPrice?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  @IsOptional()
  payments?: PaymentDto[];
}

export class ServiceDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsEnum(ServiceType)
  type: ServiceType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  @IsOptional()
  payments?: PaymentDto[];
}

export class CreateOrderDto {
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @ValidateNested()
  @Type(() => ClientInfoDto)
  @IsOptional()
  clientInfo?: ClientInfoDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDto)
  @IsOptional()
  products?: ProductDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceDto)
  @IsOptional()
  services?: ServiceDto[];

  @IsUUID()
  cashSessionId: string;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
