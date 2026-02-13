import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export class ListClosedCashSessionsQueryDto extends BasePaginationDto {
  @ApiPropertyOptional({
    description: 'Filtrar por storeId. Si el token trae varias tiendas, se recomienda enviar este campo.',
    example: '468c41d9-60a4-4daf-843d-7509fa70b817',
  })
  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }) => value?.trim())
  storeId?: string;

  @ApiPropertyOptional({
    description: 'Fecha/hora inicio (ISO). Se filtra por closedAt >= from',
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fecha/hora fin (ISO). Se filtra por closedAt <= to',
    example: '2026-02-02T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Nombre parcial del usuario que aperturó la caja (match parcial, case-insensitive)',
    example: 'juan',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  openedByName?: string;
}
