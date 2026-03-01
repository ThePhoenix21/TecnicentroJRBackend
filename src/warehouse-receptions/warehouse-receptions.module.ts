import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WarehouseCommonModule } from '../warehouse-common/warehouse-common.module';
import { WarehouseReceptionsController } from './warehouse-receptions.controller';
import { WarehouseReceptionsService } from './warehouse-receptions.service';

@Module({
  imports: [PrismaModule, WarehouseCommonModule],
  controllers: [WarehouseReceptionsController],
  providers: [WarehouseReceptionsService],
  exports: [WarehouseReceptionsService],
})
export class WarehouseReceptionsModule {}
