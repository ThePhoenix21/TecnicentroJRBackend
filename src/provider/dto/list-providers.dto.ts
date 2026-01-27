import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';

export class ListProvidersDto extends BasePaginationDto {
  @ApiPropertyOptional({ example: 'Proveedor S.A.' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ example: '20123456789' })
  @IsOptional()
  @IsString()
  ruc?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
