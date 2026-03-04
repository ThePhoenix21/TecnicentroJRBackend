import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { InventoryMovementType } from '@prisma/client';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';
import { WarehouseMovementKind } from './create-warehouse-movement.dto';

export class ListWarehouseMovementsDto extends BasePaginationDto {
  @ApiPropertyOptional({
    description: 'Filtrar por tipo de movimiento (compatibilidad con frontend)',
    enum: InventoryMovementType,
  })
  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de movimiento (deprecated, compatibilidad legacy)',
    enum: WarehouseMovementKind,
  })
  @IsOptional()
  @IsEnum(WarehouseMovementKind)
  kind?: WarehouseMovementKind;

  @ApiPropertyOptional({ description: 'Nombre de producto (coincidencia parcial)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Filtrar por usuario (ID)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Búsqueda parcial por nombre de usuario' })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ description: 'Fecha inicio (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Fecha fin (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
