import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployedStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class ListEmployedDto {
  @ApiPropertyOptional({ enum: EmployedStatus })
  @IsOptional()
  @IsEnum(EmployedStatus)
  status?: EmployedStatus;

  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Perez' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'Mecanico' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ example: 'e7291ff1-ff95-4031-b58c-69f02a67e002' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ example: '9d9f1a9d-1111-2222-3333-444444444444' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
