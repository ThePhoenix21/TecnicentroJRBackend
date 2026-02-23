import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, IsNumber, IsNotEmpty, Min } from 'class-validator';

export class UpdateSupplyOrderProductDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'Cantidad del producto' })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @ApiPropertyOptional({ description: 'Nota del producto' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateSupplyOrderDto {
  @ApiPropertyOptional({ description: 'Descripción de la orden' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'ID de la tienda' })
  @IsUUID()
  @IsNotEmpty()
  storeId: string;

  @ApiProperty({ description: 'Lista de productos de la orden', type: [UpdateSupplyOrderProductDto] })
  @IsArray()
  @IsNotEmpty()
  products: UpdateSupplyOrderProductDto[];
}
