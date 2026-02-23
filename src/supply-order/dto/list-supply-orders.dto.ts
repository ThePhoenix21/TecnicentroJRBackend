import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { SupplyOrderStatus } from '@prisma/client';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export class ListSupplyOrdersDto extends BasePaginationDto {
  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Búsqueda parcial por nombre del usuario creador' })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({ enum: SupplyOrderStatus })
  @IsOptional()
  @IsEnum(SupplyOrderStatus)
  status?: SupplyOrderStatus;

  @ApiPropertyOptional({ example: 'ABC-000123-T2R9KU' })
  @IsOptional()
  code?: string;
}
