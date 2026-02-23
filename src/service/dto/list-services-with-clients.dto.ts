import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ServiceStatus, ServiceType } from '@prisma/client';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export enum ServicesCashSessionScope {
  CURRENT = 'CURRENT',
  ALL = 'ALL',
}

export class ListServicesWithClientsDto extends BasePaginationDto {
  @ApiPropertyOptional({ enum: ServiceStatus })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional()
  @IsEnum(ServiceType)
  type?: ServiceType;

  @ApiPropertyOptional({ description: 'ID de tienda para filtrar servicios', example: '2457aa08-a2d9-4925-9a8c-ac496ba2f8f2' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Filtro por nombre de cliente', example: 'juan' })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiPropertyOptional({ description: 'Filtro por nombre de servicio', example: 'reparacion' })
  @IsOptional()
  @IsString()
  serviceName?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    enum: ServicesCashSessionScope,
    description: 'CURRENT: solo servicios de caja abierta actual. ALL: incluye cajas abiertas y cerradas.',
    default: ServicesCashSessionScope.ALL,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(ServicesCashSessionScope)
  cashSessionScope?: ServicesCashSessionScope = ServicesCashSessionScope.ALL;
}
