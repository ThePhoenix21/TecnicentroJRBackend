import { IsOptional, IsUUID, IsDateString, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryMovementType } from '@prisma/client';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export class FilterInventoryMovementDto extends BasePaginationDto {
  @ApiProperty({ description: 'ID de la tienda (obligatorio)', example: 'b3b2a6a3-1f20-4e18-9f64-8f9c78c1a111' })
  @IsUUID()
  storeId!: string;

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

  @ApiPropertyOptional({ description: 'Búsqueda parcial por nombre de usuario', example: 'roge' })
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
