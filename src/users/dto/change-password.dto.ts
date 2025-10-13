import { IsString, MinLength, IsNotEmpty } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'La contraseña actual es requerida' })
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
  @IsNotEmpty({ message: 'La nueva contraseña es requerida' })
  newPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'La confirmación de contraseña es requerida' })
  confirmNewPassword: string;
}
