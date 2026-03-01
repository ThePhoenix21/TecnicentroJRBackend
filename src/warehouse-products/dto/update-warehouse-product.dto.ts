import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateWarehouseProductDto {
  @ApiPropertyOptional({ description: 'Umbral de stock' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockThreshold?: number;
}
