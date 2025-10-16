import { Module } from '@nestjs/common';
import { ServiceService } from './service.service';
import { ServiceController } from './service.controller';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule, // Necesario para usar ConfigService en SupabaseStorageService
  ],
  controllers: [ServiceController],
  providers: [
    ServiceService,
    SupabaseStorageService, // Añadir el servicio de almacenamiento
  ],
  exports: [ServiceService],
})
export class ServiceModule {}
