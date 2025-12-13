import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsUUID, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '../enums/order-status.enum';
import { ServiceType } from '../enums/service-type.enum';

export class PaymentDto {
  @ApiProperty({ enum: PaymentType, example: 'EFECTIVO' })
  @IsEnum(PaymentType)
  type: PaymentType;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  amount: number;
}

export class ClientInfoDto {
  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'juan@email.com' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '987654321' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Av. Principal 123' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: '12345678' })
  @IsString()
  dni: string;

  @ApiPropertyOptional({ example: '20123456789' })
  @IsString()
  @IsOptional()
  ruc?: string;
}

export class ProductDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 20 })
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsNumber()
  @IsOptional()
  customPrice?: number;

  @ApiPropertyOptional({
    type: [PaymentDto],
    description: 'Campo legacy. Si se envía, será ignorado. Usar paymentMethods a nivel de orden.'
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  @IsOptional()
  payments?: PaymentDto[];
}

export class ServiceDto {
  @ApiProperty({ example: 'Cambio de aceite' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Servicio de mantenimiento' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 50, minimum: 0 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ enum: ServiceType, example: 'SERVICIO' })
  @IsEnum(ServiceType)
  type: ServiceType;

  @ApiPropertyOptional({ type: [String], example: ['https://.../foto1.jpg'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];

  @ApiPropertyOptional({
    type: [PaymentDto],
    description: 'Campo legacy. Si se envía, será ignorado. Usar paymentMethods a nivel de orden.'
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  @IsOptional()
  payments?: PaymentDto[];
}

export class CreateOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({ type: ClientInfoDto })
  @ValidateNested()
  @Type(() => ClientInfoDto)
  @IsOptional()
  clientInfo?: ClientInfoDto;

  @ApiPropertyOptional({ type: [ProductDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDto)
  @IsOptional()
  products?: ProductDto[];

  @ApiPropertyOptional({ type: [ServiceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceDto)
  @IsOptional()
  services?: ServiceDto[];

  @ApiProperty({
    type: [PaymentDto],
    description: 'Métodos de pago a nivel de orden. Campo obligatorio en el endpoint.'
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  @IsOptional()
  paymentMethods?: PaymentDto[];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cashSessionId: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  userId?: string;
}
