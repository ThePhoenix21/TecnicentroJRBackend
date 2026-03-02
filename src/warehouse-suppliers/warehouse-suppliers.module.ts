import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WarehouseCommonModule } from '../warehouse-common/warehouse-common.module';
import { WarehouseSuppliersController } from './warehouse-suppliers.controller';
import { WarehouseSuppliersService } from './warehouse-suppliers.service';

@Module({
  imports: [PrismaModule, WarehouseCommonModule],
  controllers: [WarehouseSuppliersController],
  providers: [WarehouseSuppliersService],
  exports: [WarehouseSuppliersService],
})
export class WarehouseSuppliersModule {}
