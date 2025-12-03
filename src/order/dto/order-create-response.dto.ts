import { ApiProperty } from '@nestjs/swagger';

export class OrderProductResponseDto {
  @ApiProperty()
  nombre: string;
  @ApiProperty()
  cantidad: number;
  @ApiProperty()
  precioUnitario: number;
  @ApiProperty()
  descuento: number;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  metodosPago: { tipo: string; monto: number }[];
}

export class OrderServiceResponseDto {
  @ApiProperty()
  nombre: string;
  @ApiProperty()
  descripcion: string;
  @ApiProperty()
  precio: number;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  adelantos: { tipo: string; monto: number }[];
}

export class OrderCreateResponseDto {
  @ApiProperty()
  orderId: string;
  @ApiProperty()
  orderNumber: string;
  @ApiProperty()
  businessName: string;
  @ApiProperty()
  address: string;
  @ApiProperty()
  phone: string;
  @ApiProperty()
  issueDate: string;
  @ApiProperty({ required: false })
  issueTime?: string;
  @ApiProperty()
  client: {
    nombre: string;
    documento: string;
    telefono: string;
    email: string;
    direccion: string;
  };
  @ApiProperty({ type: [OrderProductResponseDto] })
  productos: OrderProductResponseDto[];
  @ApiProperty({ type: [OrderServiceResponseDto], required: false })
  servicios?: OrderServiceResponseDto[];
  @ApiProperty({ required: false })
  adelantos?: number;
  @ApiProperty()
  subtotal: number;
  @ApiProperty()
  descuentos: number;
  @ApiProperty()
  total: number;
  @ApiProperty()
  vendedor: string;
}
