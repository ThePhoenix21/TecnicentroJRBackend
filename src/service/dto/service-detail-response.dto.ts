import { ApiProperty } from '@nestjs/swagger';

class ServiceDetailClientDto {
  @ApiProperty({ example: 'uuid-client-id', nullable: true })
  id!: string | null;

  @ApiProperty({ example: 'Juan Perez', nullable: true })
  name!: string | null;

  @ApiProperty({ example: '76543210' })
  dni!: string;

  @ApiProperty({ example: '+51999999999', nullable: true })
  phone!: string | null;

  @ApiProperty({ example: 'juan@correo.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: 'Av. Principal 123', nullable: true })
  address!: string | null;
}

class ServiceDetailOrderPaymentMethodDto {
  @ApiProperty({ example: 'EFECTIVO' })
  type!: string;

  @ApiProperty({ example: 120 })
  amount!: number;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  createdAt!: Date;
}

class ServiceDetailOrderDto {
  @ApiProperty({ example: 'uuid-order-id' })
  id!: string;

  @ApiProperty({ example: 'ORD-000123' })
  orderNumber!: string;

  @ApiProperty({ example: 'PENDING' })
  status!: string;

  @ApiProperty({ example: 500.0 })
  totalAmount!: number;

  @ApiProperty({ example: false })
  isPriceModified!: boolean;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  updatedAt!: Date;

  @ApiProperty({ example: null, nullable: true })
  canceledAt!: Date | null;

  @ApiProperty({ example: 'Tienda Principal', nullable: true })
  storeName!: string | null;

  @ApiProperty({ type: [ServiceDetailOrderPaymentMethodDto] })
  paymentMethods!: ServiceDetailOrderPaymentMethodDto[];
}

class ServiceDetailStoreServiceDto {
  @ApiProperty({ example: 'uuid-store-service-id' })
  id!: string;

  @ApiProperty({ example: 'Cambio de aceite' })
  name!: string;

  @ApiProperty({ example: 'Incluye filtro', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 80.0 })
  price!: number;

  @ApiProperty({ example: 'MAINTENANCE' })
  type!: string;
}

class ServiceDetailServiceCategoryDto {
  @ApiProperty({ example: 'uuid-category-id' })
  id!: string;

  @ApiProperty({ example: 'Mantenimiento' })
  name!: string;
}

class ServiceDetailServiceDto {
  @ApiProperty({ example: 'uuid-service-id' })
  id!: string;

  @ApiProperty({ example: 'Servicio de mantenimiento' })
  name!: string;

  @ApiProperty({ example: 'Revisión general', nullable: true })
  description!: string | null;

  @ApiProperty({ example: ['https://...'], type: [String] })
  photoUrls!: string[];

  @ApiProperty({ example: 'REPAIR' })
  type!: string;

  @ApiProperty({ example: 'IN_PROGRESS' })
  status!: string;

  @ApiProperty({ example: 250.5 })
  price!: number;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-24T20:30:19.562Z' })
  updatedAt!: Date;
}

export class ServiceDetailResponseDto {
  @ApiProperty({ example: 'uuid-service-id' })
  id!: string;

  @ApiProperty({ type: ServiceDetailServiceDto })
  service!: ServiceDetailServiceDto;

  @ApiProperty({ type: ServiceDetailOrderDto })
  order!: ServiceDetailOrderDto;

  @ApiProperty({ type: ServiceDetailClientDto })
  client!: ServiceDetailClientDto;

  @ApiProperty({ type: ServiceDetailStoreServiceDto, nullable: true })
  storeService!: ServiceDetailStoreServiceDto | null;

  @ApiProperty({ type: ServiceDetailServiceCategoryDto, nullable: true })
  serviceCategory!: ServiceDetailServiceCategoryDto | null;
}
