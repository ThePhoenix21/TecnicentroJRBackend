import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, MaxLength, IsPositive } from 'class-validator';

export class CreateCatalogProductDto {
  @ApiProperty({
    description: 'Nombre del producto (catálogo maestro)',
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
    description: 'Precio de venta sugerido (base)',
    example: 29.99,
    minimum: 0,
    required: false
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  basePrice?: number;

  @ApiProperty({
    description: 'Costo de adquisición del producto (referencia)',
    example: 20.50,
    minimum: 0,
    required: false
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  buyCost?: number;

  @ApiProperty({
    description: 'ID del usuario que crea el producto en el catálogo',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false
  })
  @IsString()
  @IsOptional()
  createdById?: string;
}
