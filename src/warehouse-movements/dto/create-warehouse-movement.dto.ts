import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export enum WarehouseMovementKind {
  INCOMING = 'INCOMING',
  OUTGOING = 'OUTGOING',
  ADJUSTMENT = 'ADJUSTMENT',
}

export class CreateWarehouseMovementDto {
  @ApiProperty({ enum: WarehouseMovementKind })
  @IsEnum(WarehouseMovementKind)
  type: WarehouseMovementKind;

  @ApiProperty({ description: 'ID del WarehouseProduct' })
  @IsUUID()
  warehouseProductId: string;

  @ApiProperty({ description: 'Cantidad (siempre positiva)', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
