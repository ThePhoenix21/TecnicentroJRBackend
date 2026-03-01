import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WarehouseCommonModule } from '../warehouse-common/warehouse-common.module';
import { WarehouseProductsController } from './warehouse-products.controller';
import { WarehouseProductsService } from './warehouse-products.service';

@Module({
  imports: [PrismaModule, WarehouseCommonModule],
  controllers: [WarehouseProductsController],
  providers: [WarehouseProductsService],
  exports: [WarehouseProductsService],
})
export class WarehouseProductsModule {}
