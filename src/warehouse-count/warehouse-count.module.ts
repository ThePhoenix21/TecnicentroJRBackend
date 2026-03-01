import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WarehouseCommonModule } from '../warehouse-common/warehouse-common.module';
import { WarehouseCountController } from './warehouse-count.controller';
import { WarehouseCountService } from './warehouse-count.service';

@Module({
  imports: [PrismaModule, WarehouseCommonModule],
  controllers: [WarehouseCountController],
  providers: [WarehouseCountService],
  exports: [WarehouseCountService],
})
export class WarehouseCountModule {}
