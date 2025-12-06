import { Module } from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';
import { InventoryCountController } from './inventory-count.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [InventoryCountController],
  providers: [InventoryCountService, PrismaService],
  exports: [InventoryCountService],
})
export class InventoryCountModule {}
