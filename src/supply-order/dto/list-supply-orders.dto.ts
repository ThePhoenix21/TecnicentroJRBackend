import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
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

  @ApiPropertyOptional({ example: 'c3d4e5f6-a7b8-9012-cdef-345678901234' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: SupplyOrderStatus })
  @IsOptional()
  @IsEnum(SupplyOrderStatus)
  status?: SupplyOrderStatus;

  @ApiPropertyOptional({ example: 'ABC-000123-T2R9KU' })
  @IsOptional()
  code?: string;
}
