import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

@Injectable()
export class DomainContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const url: string = request?.originalUrl || request?.url || '';
    const isWarehouseRoute = url === '/warehouse' || url.startsWith('/warehouse/');

    const rawWarehouseId = request?.headers?.['x-warehouse-id'];
    const rawStoreId = request?.headers?.['x-store-id'];

    const warehouseId = Array.isArray(rawWarehouseId) ? rawWarehouseId[0] : rawWarehouseId;
    const storeId = Array.isArray(rawStoreId) ? rawStoreId[0] : rawStoreId;

    if (isWarehouseRoute) {
      if (!warehouseId || typeof warehouseId !== 'string' || !isUuid(warehouseId)) {
        throw new BadRequestException('Header x-warehouse-id (UUID) es requerido para endpoints /warehouse/*');
      }

      request.warehouseId = warehouseId;
      return true;
    }

    return true;
  }
}
