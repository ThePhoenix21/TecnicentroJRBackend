import { ApiProperty } from '@nestjs/swagger';

export class ListServiceItemDto {
  @ApiProperty({ example: 'Juan Perez' })
  clientName!: string;

  @ApiProperty({ example: 'Servicio de mantenimiento' })
  serviceName!: string;

  @ApiProperty({ example: 'IN_PROGRESS' })
  status!: string;

  @ApiProperty({ example: 250.5 })
  price!: number;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  createdAt!: Date;
}
