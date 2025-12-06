import { IsOptional, IsUUID, IsDateString, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterInventoryMovementDto {
  @ApiPropertyOptional({ description: 'Filtrar por ID de tienda' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ID de StoreProduct' })
  @IsOptional()
  @IsUUID()
  storeProductId?: string;

  @ApiPropertyOptional({ description: 'Fecha inicio (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Fecha fin (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
