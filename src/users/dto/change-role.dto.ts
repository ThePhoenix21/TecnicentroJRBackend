import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsEnum
} from 'class-validator';
import { Role } from '../../auth/enums/role.enum';

export class ChangeRoleDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsNotEmpty()
  @IsEnum(Role)
  newRole: Role;
}
