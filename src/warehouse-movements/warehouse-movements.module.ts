import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WarehouseCommonModule } from '../warehouse-common/warehouse-common.module';
import { WarehouseMovementsController } from './warehouse-movements.controller';
import { WarehouseMovementsService } from './warehouse-movements.service';

@Module({
  imports: [PrismaModule, WarehouseCommonModule],
  controllers: [WarehouseMovementsController],
  providers: [WarehouseMovementsService],
  exports: [WarehouseMovementsService],
})
export class WarehouseMovementsModule {}
