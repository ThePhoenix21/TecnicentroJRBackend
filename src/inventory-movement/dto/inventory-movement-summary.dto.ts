import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class InventoryMovementSummaryDto {
  @ApiPropertyOptional({ description: 'Fecha inicio (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Fecha fin (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiProperty({ description: 'Filtrar por tienda', example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  storeId!: string;
}
