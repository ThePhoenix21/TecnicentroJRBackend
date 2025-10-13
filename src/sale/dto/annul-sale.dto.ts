import { IsString, IsNotEmpty } from 'class-validator';

export class AnnulSaleDto {
  @IsString()
  @IsNotEmpty({
    message: 'El identificador (email, nombre de usuario o nombre) es requerido',
  })
  identifier: string; // Puede ser email, username o name

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'El motivo de la anulación es requerido' })
  reason: string;
}
