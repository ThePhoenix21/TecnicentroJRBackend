import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WarehouseAccessService } from './warehouse-access.service';

@Module({
  imports: [PrismaModule],
  providers: [WarehouseAccessService],
  exports: [WarehouseAccessService],
})
export class WarehouseCommonModule {}
