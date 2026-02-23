import { ApiProperty } from '@nestjs/swagger';

export class CashMovementLookupItemDto {
  @ApiProperty({ example: 'EFECTIVO' })
  id!: string;

  @ApiProperty({ example: 'EFECTIVO' })
  value!: string;
}
