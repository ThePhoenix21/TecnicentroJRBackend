import { ApiProperty } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({
    description: 'ID del usuario',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Nombre del usuario',
    example: 'Juan Pérez',
  })
  name: string;

  @ApiProperty({
    description: 'Email del usuario',
    example: 'juan.perez@example.com',
  })
  email: string;
}

export class ServiceResponseDto {
  @ApiProperty({
    description: 'ID único del servicio',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Tipo de servicio',
    enum: ServiceType,
    example: ServiceType.REPAIR,
  })
  type: ServiceType;

  @ApiProperty({
    description: 'Descripción detallada del servicio',
    example: 'Reparación de pantalla rota',
  })
  description: string;

  @ApiProperty({
    description: 'Precio del servicio',
    example: 150.5,
  })
  price: number;

  @ApiProperty({
    description: 'Indica si el servicio ha sido pagado',
    default: false,
  })
  paid: boolean;

  @ApiProperty({
    description: 'URLs de las fotos adjuntas al servicio',
    type: [String],
    example: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
    required: false,
    default: [],
  })
  photoUrls: string[];

  @ApiProperty({
    description: 'ID del usuario que creó el servicio',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  createdById: string;

  @ApiProperty({
    description: 'Información del usuario que creó el servicio',
    type: UserResponseDto,
    required: false,
  })
  createdBy?: UserResponseDto;

  @ApiProperty({
    description: 'Fecha de creación del servicio',
    type: Date,
    example: '2023-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Fecha de última actualización del servicio',
    type: Date,
    example: '2023-01-01T00:00:00.000Z',
  })
  updatedAt: Date;
}
