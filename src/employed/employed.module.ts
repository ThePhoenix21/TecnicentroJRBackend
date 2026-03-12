import { Module } from '@nestjs/common';
import { EmployedController } from './employed.controller';
import { EmployedService } from './employed.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UtilityModule } from '../common/utility/utility.module';
import { EmployeePositionModule } from '../employee-position/employee-position.module';
import { EstablishmentRoleModule } from '../establishment-role/establishment-role.module';

@Module({
  imports: [PrismaModule, UtilityModule, EmployeePositionModule, EstablishmentRoleModule],
  controllers: [EmployedController],
  providers: [EmployedService],
  exports: [EmployedService],
})
export class EmployedModule {}
