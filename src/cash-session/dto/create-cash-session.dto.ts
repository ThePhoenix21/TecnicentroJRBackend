import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCashSessionDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID de la tienda donde se creará la sesión de caja (obligatorio)',
    required: true
  })
  @IsNotEmpty({ message: 'El ID de la tienda es obligatorio' })
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  storeId: string;

  @ApiProperty({
    example: 100.50,
    description: 'Monto inicial de apertura de caja (opcional, por defecto 0.00)',
    required: false,
    minimum: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'El monto de apertura debe ser un número' })
  @Min(0, { message: 'El monto de apertura no puede ser negativo' })
  openingAmount?: number;
}
