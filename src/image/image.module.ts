import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImageService } from './image.service';
import { ImageController } from './image.controller';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';

@Module({
  imports: [ConfigModule],
  controllers: [ImageController],
  providers: [ImageService, SupabaseStorageService],
  exports: [ImageService]
})
export class ImageModule {}
