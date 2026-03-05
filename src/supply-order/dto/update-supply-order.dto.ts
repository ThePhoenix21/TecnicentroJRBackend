import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, IsNumber, IsNotEmpty, Min, ValidateIf } from 'class-validator';

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

  @ApiPropertyOptional({ 
    description: 'ID de la tienda (requerido si no se proporciona warehouseId)',
    example: 'uuid-de-la-tienda'
  })
  @IsUUID()
  @ValidateIf((dto: UpdateSupplyOrderDto) => !dto.warehouseId)
  @IsNotEmpty()
  storeId?: string;

  @ApiPropertyOptional({ 
    description: 'ID del almacén (requerido si no se proporciona storeId)',
    example: 'uuid-del-almacen'
  })
  @IsUUID()
  @ValidateIf((dto: UpdateSupplyOrderDto) => !dto.storeId)
  @IsNotEmpty()
  warehouseId?: string;

  @ApiProperty({ description: 'Lista de productos de la orden', type: [UpdateSupplyOrderProductDto] })
  @IsArray()
  @IsNotEmpty()
  products: UpdateSupplyOrderProductDto[];
}
