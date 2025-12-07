import { IsString, IsNotEmpty, IsUUID, IsEnum, IsInt, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovementType } from '@prisma/client';

export class CreateInventoryMovementDto {
  @ApiProperty({
    description: 'ID del producto en tienda (StoreProduct)',
    example: 'uuid-del-store-product'
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  storeProductId: string;

  @ApiProperty({
    description: 'Tipo de movimiento',
    enum: InventoryMovementType,
    example: 'INCOMING'
  })
  @IsEnum(InventoryMovementType)
  @IsNotEmpty()
  type: InventoryMovementType;

  @ApiProperty({
    description: 'Cantidad del movimiento (puede ser positivo o negativo, el sistema ajusta el stock directamente)',
    example: 10,
    minimum: -999999
  })
  @IsInt()
  quantity: number;

  @ApiProperty({
    description: 'Descripción o motivo del movimiento',
    example: 'Reposición de stock semanal',
    required: false
  })
  @IsString()
  @IsOptional()
  description?: string;
}
