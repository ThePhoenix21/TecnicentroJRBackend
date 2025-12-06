import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInventoryCountSessionDto {
  @ApiProperty({
    description: 'Nombre descriptivo de la sesión de conteo',
    example: 'Inventario Fin de Mes - Tienda Principal'
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'ID de la tienda donde se realiza el conteo',
    example: 'uuid-de-la-tienda'
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  storeId: string;
}
