import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { IsEitherStoreOrWarehouse } from '../../common/validators/store-or-warehouse.validator';

export class UpdateEmployedDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: '+51 999 999 999' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'juan@empresa.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Mecánico' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'uuid-store-123', description: 'ID de la tienda donde asignar el empleado (XOR con warehouseId)' })
  @IsOptional()
  @IsString()
  @IsEitherStoreOrWarehouse()
  storeId?: string;

  @ApiPropertyOptional({ example: 'uuid-warehouse-456', description: 'ID del almacén donde asignar el empleado (XOR con storeId)' })
  @IsOptional()
  @IsString()
  @IsEitherStoreOrWarehouse()
  warehouseId?: string;
}
