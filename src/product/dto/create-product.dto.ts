import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, MaxLength, IsPositive } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'Nombre del producto',
    example: 'Aceite de motor 10W40',
    maxLength: 100
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Descripción detallada del producto',
    example: 'Aceite sintético para motor de alto rendimiento',
    required: false,
    maxLength: 500
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Precio de venta del producto',
    example: 29.99,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({
    description: 'Costo de compra del producto',
    example: 20.50,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  buycost: number;

  @ApiProperty({
    description: 'Cantidad en inventario',
    example: 50,
    default: 0,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  stock: number = 0;

  @ApiProperty({
    description: 'Umbral mínimo de inventario para alertas',
    example: 5,
    default: 1,
    minimum: 0
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  stockTreshold: number = 1;
}
