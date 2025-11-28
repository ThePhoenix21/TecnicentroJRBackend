import { IsDate, IsEmail, IsOptional, IsString, IsUUID, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Identificador único del usuario',
  })
  @IsUUID()
  id: string;
  //===================================
  @ApiProperty({
    example: 'juanperez@gmail.com',
    description: 'Correo electrónico del usuario',
  })
  @IsEmail()
  email: string;
  //===================================
  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Nombre del usuario',
  })  
  @IsString()
  name: string;
  //===================================
  @ApiProperty({
    example: 'juanperez',
    description: 'Nombre de usuario único',
  })
  @IsString()
  username: string;
  //===================================
  @ApiProperty({
    example: '+346123456789',
    description: 'Teléfono del usuario',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string | null;
//===================================
  @ApiProperty({
    example: true,
    description: 'Indica si el usuario ha sido verificado',
  })
  verified: boolean;
//===================================
  @ApiProperty({
    example: '1990-01-01T00:00:00.000Z',
    description: 'Fecha de creación del usuario',
  })
  @IsDate()
  createdAt: Date;
  //===================================
  @ApiProperty({
    description: 'Tiendas asociadas al usuario (para ADMIN: todas las tiendas, para USER: tiendas asignadas)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
        name: { type: 'string', example: 'Tienda Principal' },
        address: { type: 'string', example: 'Av. Principal 123' },
        phone: { type: 'string', example: '+123456789' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        createdById: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
        createdBy: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
            name: { type: 'string', example: 'Administrador' },
            email: { type: 'string', example: 'admin@ejemplo.com' },
            role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'ADMIN' }
          }
        }
      }
    },
    required: false
  })
  @IsOptional()
  @IsArray()
  stores?: any[];
}