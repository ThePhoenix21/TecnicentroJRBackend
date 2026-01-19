import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ReassignEmployedDto {
  @ApiPropertyOptional({ example: 'e7291ff1-ff95-4031-b58c-69f02a67e002', description: 'Nueva tienda (mutuamente exclusivo con warehouseId)' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ example: '9d9f1a9d-1111-2222-3333-444444444444', description: 'Nuevo almacén (mutuamente exclusivo con storeId)' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'ENCARGADO' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ example: 'Cambio de sede' })
  @IsOptional()
  @IsString()
  reason?: string;
}
