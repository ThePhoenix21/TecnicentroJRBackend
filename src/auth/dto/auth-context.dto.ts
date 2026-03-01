import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AuthContextDto {
  @ApiPropertyOptional({ description: 'ID de la tienda a usar como contexto activo (solo modo STORE)' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ description: 'ID del almacén a usar como contexto activo (solo modo WAREHOUSE)' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
