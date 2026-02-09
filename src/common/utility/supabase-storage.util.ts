import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

type UploadOptions = {
  bucket?: string;
  path: string;
  contentType: string;
};

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
  private readonly employeeDocsBucket = 'employee-docs';

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_KEY');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    
    console.log('Configuración de Supabase:');
    console.log('URL:', supabaseUrl ? '✅ Configurada' : '❌ No configurada');
    console.log('Service Key:', supabaseServiceKey ? '✅ Configurada' : '❌ No configurada');
    console.log('Anon Key:', supabaseAnonKey ? '✅ Configurada' : '❌ No configurada');
    
    const keyToUse = supabaseServiceKey || supabaseAnonKey;
    if (!supabaseUrl || !keyToUse) {
      throw new Error('SUPABASE_URL y SUPABASE_SERVICE_KEY (o SUPABASE_ANON_KEY) deben estar configurados en las variables de entorno');
    }
    
    this.supabase = createClient(supabaseUrl, keyToUse);
  }

  private async uploadToStorage(file: FileUpload, options: UploadOptions): Promise<{ path: string }> {
    const bucket = options.bucket ?? this.bucketName;
    const { error: uploadError } = await this.supabase.storage
      .from(bucket)
      .upload(options.path, file.buffer, {
        contentType: options.contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Error al subir el archivo: ${uploadError.message}`);
    }

    return { path: options.path };
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

  async deletePaths(paths: string[], bucket: string = this.bucketName): Promise<void> {
    if (!paths || paths.length === 0) return;

    const { error } = await this.supabase.storage.from(bucket).remove(paths);
    if (error) {
      console.error('Error al eliminar archivos:', error);
    }
  }

  async uploadEmployeeDocument(
    file: FileUpload,
    employedId: string,
    fileName: string,
  ): Promise<{ path: string; bucket: string }> {
    const path = `${employedId}/${fileName}`;
    const result = await this.uploadToStorage(file, {
      bucket: this.employeeDocsBucket,
      path,
      contentType: file.mimetype,
    });

    return { path: result.path, bucket: this.employeeDocsBucket };
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

      await this.uploadToStorage(file, { path: filePath, contentType: file.mimetype });

      return {
        url: filePath,
        path: filePath,
      };
    } catch (error) {
      console.error('Error en uploadFile:', error);
      throw new Error(`Error al procesar el archivo: ${error.message}`);
    }
  }
}
