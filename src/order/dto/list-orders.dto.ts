import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { SaleStatus } from '@prisma/client';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export class ListOrdersDto extends BasePaginationDto {
  @ApiPropertyOptional({ example: '001-20260207', description: 'Filtro por número de orden (búsqueda parcial, case-insensitive)' })
  @IsOptional()
  @IsString()
  orderNumber?: string;

  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiPropertyOptional({ example: 'Pedro' })
  @IsOptional()
  @IsString()
  sellerName?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyProducts?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyServices?: boolean;

  @ApiPropertyOptional({ enum: SaleStatus })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ example: true, description: 'Si es true, filtra por la sesión de caja abierta actual de la tienda (requiere storeId).' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  currentCash?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Requerido cuando currentCash=true.' })
  @IsOptional()
  @IsUUID()
  storeId?: string;
}
