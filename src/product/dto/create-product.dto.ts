import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, MaxLength } from 'class-validator';

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
    description: 'Precio del producto',
    example: 29.99,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({
    description: 'Cantidad en inventario',
    example: 50,
    default: 0,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  stock: number = 0;
}
