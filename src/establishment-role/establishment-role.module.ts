import { Module } from '@nestjs/common';
import { EstablishmentRoleController } from './establishment-role.controller';
import { EstablishmentRoleService } from './establishment-role.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EstablishmentRoleController],
  providers: [EstablishmentRoleService],
  exports: [EstablishmentRoleService],
})
export class EstablishmentRoleModule {}
