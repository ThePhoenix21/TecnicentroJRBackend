import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Role } from 'src/auth/enums/role.enum';

export class CreateUserFromEmployedDto {
  @ApiProperty({ example: 'c7d2f3a1-1111-2222-3333-444444444444' })
  @IsUUID()
  employedId!: string;

  @ApiProperty({ example: 'ADMIN', enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    required: false,
    description: 'Obligatorio si role=USER',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: ['VIEW_INVENTORY', 'CREATE_ORDER'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
