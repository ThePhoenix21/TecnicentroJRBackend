/**
 * Respuesta exitosa al subir una imagen
 */
export class ImageUploadResponse {
  /**
   * Indica si la operación fue exitosa
   * @example true
   */
  success: boolean;

  /**
   * Mensaje descriptivo del resultado
   * @example 'Imagen subida exitosamente'
   */
  message: string;

  /**
   * Datos de la imagen subida
   */
  data: {
    /**
     * URL pública de la imagen subida
     * @example 'https://example.com/images/1234567890-abc123.jpg'
     */
    url: string;

    /**
     * Fecha de expiración de la URL
     * @example '2025-10-23T14:57:00.000Z'
     */
    expiresAt: string;

    /**
     * Días de validez de la URL
     * @example 7
     */
    expiresInDays: number;
  };
}

/**
 * DTO para la respuesta de error
 */
export class ErrorResponse {
  /**
   * Código de estado HTTP
   * @example 400
   */
  statusCode: number;

  /**
   * Mensaje de error
   * @example 'Formato de archivo no soportado'
   */
  message: string;

  /**
   * Nombre del error
   * @example 'Bad Request'
   */
  error: string;
}
