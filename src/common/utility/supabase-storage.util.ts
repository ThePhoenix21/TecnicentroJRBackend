import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

type FileUpload = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class SupabaseStorageService {
  private supabase: SupabaseClient;
  private readonly bucketName = 'services'; // Nombre del bucket en Supabase
  private readonly expiresIn = 60 * 60 * 24 * 365; // 1 año en segundos

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    
    console.log('Configuración de Supabase:');
    console.log('URL:', supabaseUrl ? '✅ Configurada' : '❌ No configurada');
    console.log('Anon Key:', supabaseAnonKey ? '✅ Configurada' : '❌ No configurada');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('SUPABASE_URL y SUPABASE_ANON_KEY deben estar configurados en las variables de entorno');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  async uploadServicePhotos(files: FileUpload[]): Promise<string[]> {
    if (!files || files.length === 0) return [];
    
    if (files.length > 5) {
      throw new Error('No se pueden subir más de 5 archivos');
    }

    const uploadPromises = files.map(async (file) => {
      // Validar tamaño del archivo (5MB máximo)
      if (file.buffer.length > 5 * 1024 * 1024) {
        throw new Error(`El archivo ${file.originalname} excede el tamaño máximo de 5MB`);
      }

      // Generar un nombre único para el archivo
      const fileExt = file.originalname.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `services/${fileName}`;

      // Subir el archivo a Supabase Storage
      const { error: uploadError } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Error al subir el archivo: ${uploadError.message}`);
      }

      // Obtener URL pública con tiempo de expiración
      const { data: { publicUrl } } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath, {
          download: true,
        });

      return publicUrl;
    });

    return Promise.all(uploadPromises);
  }

  async deleteFiles(urls: string[]): Promise<void> {
    if (!urls || urls.length === 0) return;

    const deletePromises = urls.map(async (url) => {
      const filePath = url.split('/').pop();
      if (filePath) {
        const { error } = await this.supabase.storage
          .from(this.bucketName)
          .remove([`services/${filePath}`]);
        
        if (error) {
          console.error(`Error al eliminar archivo ${filePath}:`, error);
        }
      }
    });

    await Promise.all(deletePromises);
  }

  async uploadFile(
    file: FileUpload, 
    folder: string = 'uploads',
    expiresIn: number = this.expiresIn
  ): Promise<{ url: string; path: string }> {
    try {
      // Generar un nombre único para el archivo
      const fileExt = file.originalname.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `${folder}/${fileName}`;

      // Subir el archivo a Supabase Storage
      const { error: uploadError } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Error al subir el archivo: ${uploadError.message}`);
      }

      // Obtener URL pública en lugar de URL firmada
      const { data: { publicUrl } } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      if (!publicUrl) {
        throw new Error('No se pudo generar la URL pública');
      }

      return {
        url: publicUrl,
        path: filePath
      };
    } catch (error) {
      console.error('Error en uploadFile:', error);
      throw new Error(`Error al procesar el archivo: ${error.message}`);
    }
  }
}
