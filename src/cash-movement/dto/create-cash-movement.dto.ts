import { IsString, IsNotEmpty, IsNumber, IsUUID, IsOptional, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MovementType, PaymentType } from '@prisma/client';

export class CreateCashMovementDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID de la sesión de caja (obligatorio)',
    required: true
  })
  @IsNotEmpty({ message: 'El ID de la sesión de caja es obligatorio' })
  @IsUUID('4', { message: 'El ID de la sesión de caja debe ser un UUID válido' })
  cashSessionId: string;

  @ApiProperty({
    example: 100.50,
    description: 'Monto del movimiento (puede ser negativo para salidas)',
    required: true
  })
  @IsNotEmpty({ message: 'El monto es obligatorio' })
  @IsNumber({}, { message: 'El monto debe ser un número' })
  amount: number;

  @ApiProperty({
    example: 'INCOME',
    description: 'Tipo de movimiento (INCOME o EXPENSE)',
    required: true,
    enum: MovementType
  })
  @IsEnum(MovementType, { message: 'El tipo de movimiento debe ser INCOME o EXPENSE' })
  type: MovementType;

  @ApiProperty({
    example: 'DATAPHONE',
    description: 'Método de pago del movimiento (opcional). Si no se envía, se asume EFECTIVO.',
    required: false,
    enum: PaymentType,
  })
  @IsOptional()
  @IsEnum(PaymentType, { message: 'El método de pago no es válido' })
  payment?: PaymentType;

  @ApiProperty({
    example: 'Venta de productos varios',
    description: 'Descripción del movimiento (obligatoria)',
    required: true
  })
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  description: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID de la orden (opcional, solo para movimientos generados por órdenes)',
    required: false
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID de la orden debe ser un UUID válido' })
  orderId?: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID del cliente (opcional, solo para movimientos generados por órdenes)',
    required: false
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido' })
  clientId?: string;
}

// DTO para movimientos generados desde órdenes (uso interno)
export class CreateOrderCashMovementDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID de la sesión de caja'
  })
  @IsUUID('4')
  cashSessionId: string;

  @ApiProperty({
    example: 150.75,
    description: 'Monto del pago en efectivo'
  })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID de la orden'
  })
  @IsUUID('4')
  orderId: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID del cliente'
  })
  @IsUUID('4')
  clientId?: string;

  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Nombre del cliente'
  })
  @IsString()
  @IsOptional()
  clientName?: string;

  @ApiProperty({
    example: 'cliente@ejemplo.com',
    description: 'Email del cliente'
  })
  @IsString()
  @IsOptional()
  clientEmail?: string;
}
