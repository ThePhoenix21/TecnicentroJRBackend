import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WarehouseSuppliersController } from './warehouse-suppliers.controller';
import { WarehouseSuppliersService } from './warehouse-suppliers.service';

@Module({
  imports: [PrismaModule],
  controllers: [WarehouseSuppliersController],
  providers: [WarehouseSuppliersService],
  exports: [WarehouseSuppliersService],
})
export class WarehouseSuppliersModule {}
