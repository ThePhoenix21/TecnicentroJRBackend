import { IsOptional, IsUUID, IsDateString, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryMovementType } from '@prisma/client';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export class FilterInventoryMovementDto extends BasePaginationDto {
  @ApiPropertyOptional({ description: 'Nombre de producto (coincidencia parcial)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Filtrar por tipo de movimiento', enum: InventoryMovementType })
  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @ApiPropertyOptional({ description: 'Filtrar por usuario (ID)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Fecha inicio (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Fecha fin (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

}
