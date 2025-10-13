import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../prisma.service';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [
    UsersService, 
    PrismaService, 
    {
      provide: 'APP_GUARD',
      useClass: RolesGuard,
    }
  ],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}