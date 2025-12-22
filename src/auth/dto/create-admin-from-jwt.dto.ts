import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdminFromJwtDto {
  @ApiProperty({
    example: 'admin2@correo.com',
    description: 'Correo electrónico del admin a crear',
  })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  email: string;

  @ApiProperty({
    example: 'TuPassword1!',
    description: 'Contraseña del usuario (mínimo 6 caracteres)',
    minLength: 6,
  })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @ApiProperty({
    example: 'Nombre Admin',
    description: 'Nombre completo del usuario',
  })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @ApiProperty({
    example: 'admin2',
    description: 'Nombre de usuario único',
  })
  @IsNotEmpty({ message: 'El nombre de usuario es obligatorio' })
  username: string;

  @ApiProperty({
    example: '+1234567890',
    description: 'Número de teléfono del usuario (opcional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: ['VIEW_DASHBOARD', 'MANAGE_ORDERS'],
    description: 'Lista de permisos granulares para el admin. Si no se envía, se asignan todos por defecto.',
    required: false,
    type: [String],
  })
  @IsOptional()
  permissions?: string[];
}
