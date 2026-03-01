import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateWarehouseProductDto {
  @ApiProperty({ description: 'Producto del catálogo' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ description: 'Stock inicial', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ description: 'Umbral de stock', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockThreshold?: number;
}
