import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceSellerDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'Juan Perez' })
  name!: string;
}

export class ListServiceItemDto {
  @ApiPropertyOptional({ example: '802144c0-f00b-4636-9298-4b29a5ea443e' })
  clientId?: string | null;

  @ApiProperty({ example: 'Juan Perez' })
  clientName!: string;

  @ApiPropertyOptional({ example: '40498a52-f6a1-48e3-819c-bdf4ab397ab6' })
  serviceId?: string;

  @ApiProperty({ example: 'Servicio de mantenimiento' })
  serviceName!: string;

  @ApiProperty({ example: 'IN_PROGRESS' })
  status!: string;

  @ApiProperty({ example: 250.5 })
  price!: number;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  createdAt!: Date;

  @ApiPropertyOptional({ type: ServiceSellerDto, description: 'Usuario que creó la orden asociada al servicio.' })
  seller?: ServiceSellerDto;

  @ApiPropertyOptional({ example: false, description: 'Indica si el servicio pertenece a la caja abierta actual de la tienda consultada.' })
  isFromCurrentCash?: boolean;
}
