import { BasePaginationDto } from '../../common/dto/base-pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ServiceStatus } from '@prisma/client';

export class ListServicesDto extends BasePaginationDto {
  @ApiPropertyOptional({ enum: ServiceStatus })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiPropertyOptional({ description: 'Filtrar solo servicios de caja abierta (cashSession activa)', example: false })
  @IsOptional()
  @IsBoolean()
  openCashOnly?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Tienda a consultar (requerido para usuarios con VIEW_ALL_SERVICES)', example: 'f1b7c2b8-7a75-4e85-8eab-a8535f2d9df0' })
  @IsOptional()
  @IsUUID()
  storeId?: string;
}
