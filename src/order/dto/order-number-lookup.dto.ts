import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class OrderNumberLookupDto {
  @ApiPropertyOptional({ example: '001-20260207', description: 'Búsqueda parcial por número de orden (case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtrar por tienda (opcional)' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ example: 30, description: 'Máximo de resultados (default 50, max 200)' })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
