import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovementType } from '@prisma/client';

export class ListInventoryMovementItemDto {
  @ApiProperty({ example: 'b3c7d066-5ee7-4b9f-8888-6ff0c5c71c11' })
  id!: string;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  date!: Date;

  @ApiProperty({ example: 'Cigarrera Vex' })
  name!: string;

  @ApiProperty({ enum: InventoryMovementType, example: InventoryMovementType.INCOMING })
  type!: InventoryMovementType;

  @ApiProperty({ example: 5 })
  quantity!: number;

  @ApiProperty({ example: 'Alex Mantilla', nullable: true })
  userName!: string | null;

  @ApiProperty({ example: 'Reposición semanal', nullable: true })
  description!: string | null;
}
