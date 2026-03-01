import { BadRequestException } from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';

export function resolveStockChange(type: InventoryMovementType, quantity: number): number {
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new BadRequestException('quantity debe ser un número distinto de 0');
  }

  if (type === InventoryMovementType.INCOMING) {
    return Math.abs(quantity);
  }

  if (type === InventoryMovementType.OUTGOING) {
    return -Math.abs(quantity);
  }

  if (type === InventoryMovementType.ADJUST) {
    return quantity;
  }

  throw new BadRequestException('Tipo de movimiento no soportado para almacén');
}

export function ensureNonNegativeStock(currentStock: number, stockChange: number): void {
  if (currentStock + stockChange < 0) {
    throw new BadRequestException('Stock insuficiente para realizar esta operación');
  }
}
