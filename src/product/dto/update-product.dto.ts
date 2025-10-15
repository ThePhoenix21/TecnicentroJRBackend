import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, MaxLength } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiProperty({
    description: 'Nuevo nombre del producto',
    example: 'Martillo de carpintero profesional',
    maxLength: 100,
    required: false
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    description: 'Nueva descripción del producto',
    example: 'Martillo de carpintero profesional con mango de fibra de vidrio y cabeza de acero forjado',
    required: false,
    maxLength: 500
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Nuevo precio del producto',
    example: 34.99,
    minimum: 0.01,
    required: false
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  price?: number;

  @ApiProperty({
    description: 'Nueva cantidad en stock',
    example: 75,
    minimum: 0,
    required: false
  })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @IsOptional()
  stock?: number;
}
