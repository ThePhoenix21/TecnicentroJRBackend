import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty, Min, MaxLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'Nombre del producto',
    example: 'Martillo de carpintero',
    maxLength: 100
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Descripción del producto',
    example: 'Martillo de carpintero profesional con mango de fibra de vidrio',
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
    minimum: 0.01
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price: number;

  @ApiProperty({
    description: 'Cantidad en stock',
    example: 50,
    minimum: 0,
    default: 0
  })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  stock?: number = 0;
}
