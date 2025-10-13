import { ApiProperty } from '@nestjs/swagger';

export class CreatedByDto {
  @ApiProperty({ description: 'ID del usuario' })
  id: string;

  @ApiProperty({ description: 'Nombre del usuario', nullable: true })
  name: string | null;

  @ApiProperty({ description: 'Email del usuario' })
  email: string;
}

export class ProductResponseDto {
  @ApiProperty({ description: 'ID único del producto' })
  id: string;

  @ApiProperty({ description: 'Nombre del producto' })
  name: string;

  @ApiProperty({ 
    description: 'Descripción del producto', 
    required: false,
    nullable: true
  })
  description: string | null;

  @ApiProperty({ description: 'Precio del producto' })
  price: number;

  @ApiProperty({ description: 'Cantidad en inventario', default: 0 })
  stock: number;

  @ApiProperty({ description: 'Fecha de creación' })
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  updatedAt: Date;

  @ApiProperty({ description: 'ID del usuario que creó el producto' })
  createdById: string;

  @ApiProperty({ 
    description: 'Información del usuario que creó el producto',
    type: CreatedByDto,
    required: false
  })
  createdBy?: CreatedByDto;
}

export class ProductListResponseDto {
  @ApiProperty({ 
    description: 'Lista de productos',
    type: [ProductResponseDto] 
  })
  data: ProductResponseDto[];

  @ApiProperty({ description: 'Total de registros' })
  total: number;
}
