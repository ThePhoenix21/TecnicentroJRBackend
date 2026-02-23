import { ApiProperty } from '@nestjs/swagger';

export class ServiceLookupItemDto {
  @ApiProperty({ example: '15df5238-28d9-449a-9c59-1ff3f96b3afe' })
  id!: string;

  @ApiProperty({ example: 'Servicio de mantenimiento' })
  value!: string;
}
