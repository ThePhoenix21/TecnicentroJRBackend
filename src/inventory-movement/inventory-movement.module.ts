import { Module } from '@nestjs/common';
import { InventoryMovementService } from './inventory-movement.service';
import { InventoryMovementController } from './inventory-movement.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [InventoryMovementController],
  providers: [InventoryMovementService, PrismaService],
  exports: [InventoryMovementService],
})
export class InventoryMovementModule {}
