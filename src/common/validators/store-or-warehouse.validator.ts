import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function IsEitherStoreOrWarehouse(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isEitherStoreOrWarehouse',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as any;
          const storeId = obj.storeId;
          const warehouseId = obj.warehouseId;

          // Either storeId or warehouseId must be provided, but not both
          const hasStoreId = storeId !== undefined && storeId !== null && storeId !== '';
          const hasWarehouseId = warehouseId !== undefined && warehouseId !== null && warehouseId !== '';

          return (hasStoreId && !hasWarehouseId) || (!hasStoreId && hasWarehouseId);
        },
        defaultMessage(args: ValidationArguments) {
          return 'Debe proporcionar storeId O warehouseId, pero no ambos';
        },
      },
    });
  };
}
