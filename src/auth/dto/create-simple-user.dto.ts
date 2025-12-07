import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSimpleUserDto {
  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Nombre completo del usuario',
  })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'juanperez',
    description: 'Nombre de usuario único (opcional, se generará automáticamente si no se especifica)',
    required: false
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({
    example: 'usuario@ejemplo.com',
    description: 'Correo electrónico del usuario (opcional)',
    required: false
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  email?: string;

  @ApiProperty({
    example: '+1234567890',
    description: 'Número de teléfono del usuario (opcional)',
    required: false
  })
  @IsOptional()
  @IsString({ message: 'El número de teléfono debe ser una cadena de texto' })
  phone?: string;

  @ApiProperty({
    example: 'passwordSeguro123',
    description: 'Contraseña del usuario (mínimo 6 caracteres)',
    minLength: 6,
  })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID de la tienda a la que pertenecerá el usuario (obligatorio)',
    required: true
  })
  @IsNotEmpty({ message: 'El ID de la tienda es obligatorio' })
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  storeId: string;

  @ApiProperty({
    example: ['VIEW_INVENTORY', 'CREATE_ORDER'],
    description: 'Lista de permisos granulares para el usuario',
    required: false,
    type: [String]
  })
  @IsOptional()
  permissions?: string[];
}
