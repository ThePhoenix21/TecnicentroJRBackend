import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la tienda es requerido' })
  name: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  // Credenciales del administrador que crea la tienda
  @IsEmail({}, { message: 'El correo del administrador debe ser válido' })
  @IsNotEmpty({ message: 'El correo del administrador es requerido' })
  adminEmail: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña del administrador es requerida' })
  adminPassword: string;
}
