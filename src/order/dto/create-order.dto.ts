import { 
  IsArray, 
  IsNotEmpty, 
  IsNumber, 
  IsOptional, 
  IsString, 
  IsUUID, 
  ValidateNested, 
  IsObject, 
  Min, 
  IsPositive, 
  IsEnum,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceType, SaleStatus } from '@prisma/client';

@ValidatorConstraint({ name: 'clientInfoOrId', async: false })
class ClientInfoOrIdConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const object = args.object as any;
    return !(!object.clientId && !object.clientInfo);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Se requiere el ID del cliente o la información del cliente';
  }
}

function ClientInfoOrId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: ClientInfoOrIdConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'notBothClientInfoAndId', async: false })
class NotBothClientInfoAndIdConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const object = args.object as any;
    return !(object.clientId && object.clientInfo);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Solo se debe proporcionar el ID del cliente o la información del cliente, no ambos';
  }
}

function NotBothClientInfoAndId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: NotBothClientInfoAndIdConstraint,
    });
  };
}

class ClientInfoDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsNotEmpty()
  dni: string;
}

class OrderProductDto {
  @IsString()
  @IsUUID()
  productId: string;

  @IsNumber()
  @IsPositive()
  @Min(1)
  quantity: number;
}

class ServiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsEnum(ServiceType)
  type: ServiceType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photoUrls?: string[];
}

export class CreateOrderDto {
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => ClientInfoDto)
  @NotBothClientInfoAndId({
    message: 'No se puede proporcionar tanto clientId como clientInfo',
  })
  clientInfo?: ClientInfoDto;

  @IsString()
  @IsUUID()
  @IsOptional()
  @NotBothClientInfoAndId({
    message: 'No se puede proporcionar tanto clientId como clientInfo',
  })
  clientId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderProductDto)
  @IsOptional()
  products: OrderProductDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceDto)
  @IsOptional()
  services: ServiceDto[] = [];

  @IsString()
  @IsUUID()
  @IsOptional() // Hacemos que userId sea opcional en el DTO, se asignará desde el token
  userId?: string;

  @IsString()
  @IsOptional()
  orderNumber?: string;

  @IsEnum(SaleStatus)
  @IsOptional()
  status?: SaleStatus;

  @ClientInfoOrId({
    message: 'Se requiere el ID del cliente o la información del cliente',
  })
  requireClientInfoOrId: boolean = true;
}
