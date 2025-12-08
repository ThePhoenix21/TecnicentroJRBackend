import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  ParseUUIDPipe,
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ServiceService } from './service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './entities/service.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { ServiceStatus, ServiceType } from '@prisma/client';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';
import { memoryStorage } from 'multer';

@ApiTags('Servicios')
@ApiBearerAuth('JWT')
@ApiExtraModels(Service)
@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'No autorizado. Se requiere autenticación JWT' })
@ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Acceso denegado. Se requieren permisos adecuados' })
@ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Error interno del servidor' })
export class ServiceController {
  constructor(
    private readonly serviceService: ServiceService,
    private readonly supabaseStorage: SupabaseStorageService
  ) {}

  @Post('create')
  @Roles(Role.ADMIN, Role.USER)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 5 // máximo 5 archivos
    },
    fileFilter: (req, file, cb) => {
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        return cb(new Error('Solo se permiten imágenes (jpg, jpeg, png, gif)'), false);
      }
      cb(null, true);
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Crear un nuevo servicio',
    description: 'Permite a usuarios ADMIN y USER registrar un nuevo servicio en el sistema. Se pueden adjuntar imágenes opcionales del servicio. Las imágenes se suben automáticamente a Supabase Storage y se generan URLs firmadas con validez de 1 año.'
  })
  @ApiBody({
    description: 'Datos del servicio a crear. El campo `file` es opcional y permite subir hasta 5 imágenes.',
    schema: {
      type: 'object',
      required: ['type', 'status', 'name', 'price', 'orderId'],
      properties: {
        type: { 
          type: 'string', 
          enum: Object.values(ServiceType), 
          description: 'Tipo de servicio a realizar',
          example: 'REPAIR' 
        },
        status: { 
          type: 'string', 
          enum: Object.values(ServiceStatus), 
          description: 'Estado inicial del servicio',
          example: 'IN_PROGRESS' 
        },
        name: { 
          type: 'string', 
          description: 'Nombre descriptivo del servicio',
          example: 'Reparación completa del motor',
          minLength: 1,
          maxLength: 255
        },
        description: { 
          type: 'string', 
          description: 'Descripción detallada del trabajo a realizar',
          example: 'Revisión completa del motor, cambio de aceite y filtros',
          maxLength: 1000
        },
        price: { 
          type: 'number', 
          description: 'Costo del servicio en USD',
          example: 250.00,
          minimum: 0
        },
        orderId: { 
          type: 'string', 
          format: 'uuid', 
          description: 'ID de la orden a la que pertenece este servicio',
          example: '123e4567-e89b-12d3-a456-426614174000' 
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (jpg, jpeg, png, gif) - Máximo 5MB por archivo'
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Servicio creado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174001' },
        type: { type: 'string', enum: Object.values(ServiceType), example: 'REPAIR' },
        status: { type: 'string', enum: Object.values(ServiceStatus), example: 'IN_PROGRESS' },
        name: { type: 'string', example: 'Reparación completa del motor' },
        description: { type: 'string', example: 'Revisión completa del motor, cambio de aceite y filtros' },
        photoUrls: { type: 'array', items: { type: 'string' }, example: ['https://supabase-url.com/photo1.jpg'] },
        price: { type: 'number', example: 250.00 },
        orderId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Datos de entrada inválidos o faltantes',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'El tipo de servicio es requerido' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tiene permisos para realizar esta acción',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Forbidden resource' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.UNPROCESSABLE_ENTITY, 
    description: 'Error al procesar los archivos adjuntos',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 422 },
        message: { type: 'string', example: 'Solo se permiten imágenes (jpg, jpeg, png, gif)' },
        error: { type: 'string', example: 'Unprocessable Entity' }
      }
    }
  })
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.MANAGE_SERVICES)
  async create(
    @Body() createServiceDto: CreateServiceDto,
    @UploadedFile() file?: Express.Multer.File
  ): Promise<Service> {
    try {
      // Subir imagen a Supabase si hay archivo
      if (file) {
        const uploadedFile = await this.supabaseStorage.uploadServicePhotos([{
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype
        }]);
        createServiceDto.photoUrls = uploadedFile;
      }

      return this.serviceService.create(createServiceDto);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('findAll')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Obtener lista de servicios',
    description: 'Obtiene una lista de servicios registrados en el sistema. Permite filtrar por estado y tipo de servicio. Los usuarios ADMIN pueden ver todos los servicios, mientras que los USER solo pueden ver los servicios de sus órdenes.'
  })
  @ApiQuery({ 
    name: 'status', 
    required: false, 
    enum: ServiceStatus, 
    description: 'Filtrar servicios por estado actual',
    example: 'IN_PROGRESS',
    schema: {
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: null
    }
  })
  @ApiQuery({ 
    name: 'type', 
    required: false, 
    enum: ServiceType, 
    description: 'Filtrar servicios por tipo de servicio',
    example: 'REPAIR',
    schema: {
      enum: ['REPAIR', 'MAINTENANCE', 'INSPECTION', 'CUSTOM'],
      default: null
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de servicios obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174001' },
          type: { type: 'string', enum: Object.values(ServiceType), example: 'REPAIR' },
          status: { type: 'string', enum: Object.values(ServiceStatus), example: 'IN_PROGRESS' },
          name: { type: 'string', example: 'Reparación completa del motor' },
          description: { type: 'string', example: 'Revisión completa del motor' },
          photoUrls: { type: 'array', items: { type: 'string' }, example: ['https://supabase-url.com/photo1.jpg'] },
          price: { type: 'number', example: 250.00 },
          orderId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Parámetros de filtrado inválidos',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Valor de estado no válido' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async findAll(
    @Query('status') status?: ServiceStatus,
    @Query('type') type?: ServiceType,
  ): Promise<Service[]> {
    return this.serviceService.findAll(status, type);
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Obtener servicio por ID',
    description: 'Obtiene los detalles completos de un servicio específico mediante su ID. Los usuarios ADMIN pueden ver cualquier servicio, mientras que los USER solo pueden ver servicios de sus órdenes.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID único del servicio (UUID v4)', 
    example: '123e4567-e89b-12d3-a456-426614174001',
    required: true 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Servicio encontrado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174001' },
        type: { type: 'string', enum: Object.values(ServiceType), example: 'REPAIR' },
        status: { type: 'string', enum: Object.values(ServiceStatus), example: 'IN_PROGRESS' },
        name: { type: 'string', example: 'Reparación completa del motor' },
        description: { type: 'string', example: 'Revisión completa del motor, cambio de aceite y filtros' },
        photoUrls: { type: 'array', items: { type: 'string' }, example: ['https://supabase-url.com/photo1.jpg', 'https://supabase-url.com/photo2.jpg'] },
        price: { type: 'number', example: 250.00 },
        orderId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
        createdAt: { type: 'string', format: 'date-time', example: '2023-12-01T10:30:00.000Z' },
        updatedAt: { type: 'string', format: 'date-time', example: '2023-12-01T15:45:00.000Z' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró ningún servicio con el ID proporcionado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Servicio con ID "123e4567-e89b-12d3-a456-426614174001" no encontrado' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Formato de ID inválido',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Validation failed (uuid is expected)' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Service> {
    return this.serviceService.findOne(id);
  }

  @Patch('update/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Actualizar un servicio',
    description: 'Actualiza los datos de un servicio existente. Solo actualiza los campos proporcionados en el body. Los usuarios ADMIN pueden actualizar cualquier servicio, mientras que los USER solo pueden actualizar servicios de sus órdenes.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID único del servicio a actualizar (UUID v4)', 
    example: '123e4567-e89b-12d3-a456-426614174001',
    required: true 
  })
  @ApiBody({ 
    type: UpdateServiceDto,
    description: 'Campos del servicio a actualizar. Todos los campos son opcionales.',
    examples: {
      actualizarEstado: {
        summary: 'Actualizar estado del servicio',
        description: 'Cambia el estado del servicio a COMPLETED',
        value: { status: 'COMPLETED' }
      },
      actualizarPrecio: {
        summary: 'Actualizar precio del servicio',
        description: 'Modifica el costo del servicio',
        value: { price: 300.00 }
      },
      actualizarCompleto: {
        summary: 'Actualizar múltiples campos',
        description: 'Actualiza nombre, descripción y precio',
        value: {
          name: 'Reparación completa del motor con filtros',
          description: 'Revisión completa del motor, cambio de aceite, filtros y bujías',
          price: 350.00
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Servicio actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174001' },
        type: { type: 'string', enum: Object.values(ServiceType), example: 'REPAIR' },
        status: { type: 'string', enum: Object.values(ServiceStatus), example: 'COMPLETED' },
        name: { type: 'string', example: 'Reparación completa del motor con filtros' },
        description: { type: 'string', example: 'Revisión completa del motor, cambio de aceite, filtros y bujías' },
        photoUrls: { type: 'array', items: { type: 'string' }, example: ['https://supabase-url.com/photo1.jpg'] },
        price: { type: 'number', example: 350.00 },
        orderId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró el servicio especificado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Servicio con ID "123e4567-e89b-12d3-a456-426614174001" no encontrado' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tiene permisos para realizar esta acción',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No tienes permisos para actualizar este servicio' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Datos de entrada inválidos',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'El precio debe ser un número positivo' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @RequirePermissions(PERMISSIONS.MANAGE_SERVICES)
  async update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateServiceDto: UpdateServiceDto
  ): Promise<Service> {
    return this.serviceService.update(id, updateServiceDto);
  }

  @Patch('status/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Cambiar estado de un servicio',
    description: 'Actualiza específicamente el estado de un servicio. Los usuarios ADMIN pueden cambiar el estado de cualquier servicio, mientras que los USER solo pueden cambiar el estado de servicios de sus órdenes. Este endpoint está diseñado para transiciones de estado simples y rápidas.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID único del servicio a actualizar (UUID v4)', 
    example: '123e4567-e89b-12d3-a456-426614174001',
    required: true 
  })
  @ApiBody({ 
    description: 'Nuevo estado del servicio',
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { 
          type: 'string', 
          enum: ['IN_PROGRESS', 'COMPLETED', 'DELIVERED', 'PAID', 'ANNULLATED'],
          description: 'Nuevo estado del servicio',
          examples: {
            en_progreso: { value: 'IN_PROGRESS', summary: 'En progreso' },
            completado: { value: 'COMPLETED', summary: 'Completado' },
            entregado: { value: 'DELIVERED', summary: 'Entregado' },
            pagado: { value: 'PAID', summary: 'Pagado' },
            anulado: { value: 'ANNULLATED', summary: 'Anulado' }
          }
        }
      }
    },
    examples: {
      cambiarACompletado: {
        summary: 'Marcar servicio como completado',
        description: 'Cambia el estado del servicio a COMPLETED cuando el trabajo ha finalizado',
        value: { status: 'COMPLETED' }
      },
      cambiarAEntregado: {
        summary: 'Marcar servicio como entregado',
        description: 'Cambia el estado del servicio a DELIVERED cuando se ha entregado al cliente',
        value: { status: 'DELIVERED' }
      },
      cambiarAPagado: {
        summary: 'Marcar servicio como pagado',
        description: 'Cambia el estado del servicio a PAID cuando se ha realizado el pago',
        value: { status: 'PAID' }
      },
      cambiarAnulado: {
        summary: 'Anular servicio',
        description: 'Cambia el estado del servicio a ANNULLATED cuando se cancela el servicio',
        value: { status: 'ANNULLATED' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Estado del servicio actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174001' },
        type: { type: 'string', enum: Object.values(ServiceType), example: 'REPAIR' },
        status: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED', 'DELIVERED', 'PAID', 'ANNULLATED'], example: 'COMPLETED' },
        name: { type: 'string', example: 'Reparación completa del motor' },
        description: { type: 'string', example: 'Revisión completa del motor, cambio de aceite y filtros' },
        photoUrls: { type: 'array', items: { type: 'string' }, example: ['https://supabase-url.com/photo1.jpg'] },
        price: { type: 'number', example: 250.00 },
        orderId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró el servicio especificado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Servicio con ID "123e4567-e89b-12d3-a456-426614174001" no encontrado' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tiene permisos para realizar esta acción',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No tienes permisos para cambiar el estado de este servicio' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Estado no válido o datos inválidos',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Estado no válido. Los estados permitidos son: IN_PROGRESS, COMPLETED, DELIVERED, PAID, ANNULLATED' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @RequirePermissions(PERMISSIONS.MANAGE_SERVICES)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateStatusDto: { status: 'IN_PROGRESS' | 'COMPLETED' | 'DELIVERED' | 'PAID' | 'ANNULLATED' }
  ): Promise<Service> {
    return this.serviceService.update(id, { status: updateStatusDto.status });
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar un servicio',
    description: 'Elimina permanentemente un servicio del sistema. Esta acción solo puede ser realizada por usuarios con rol ADMIN. La eliminación es irreversible y también eliminará las imágenes asociadas en Supabase Storage.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID único del servicio a eliminar (UUID v4)',
    example: '123e4567-e89b-12d3-a456-426614174001',
    required: true 
  })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Servicio eliminado exitosamente. No retorna contenido en el body.'
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró el servicio especificado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Servicio con ID "123e4567-e89b-12d3-a456-426614174001" no encontrado' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tiene permisos para realizar esta acción. Solo ADMIN puede eliminar servicios.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Forbidden resource' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'No se puede eliminar el servicio porque tiene registros asociados',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'No se puede eliminar el servicio porque está asociado a una orden activa' },
        error: { type: 'string', example: 'Conflict' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Formato de ID inválido',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Validation failed (uuid is expected)' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @RequirePermissions(PERMISSIONS.MANAGE_SERVICES)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.serviceService.remove(id);
  }

  @Get(':id/pending-payment')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Obtener monto pendiente de pago de un servicio',
    description: 'Calcula el monto restante por pagar de un servicio específico. Revisa todos los pagos registrados para el servicio y resta el total del precio del servicio. Disponible para usuarios ADMIN y USER.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID único del servicio (UUID v4)', 
    example: '123e4567-e89b-12d3-a456-426614174001',
    required: true 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Monto pendiente calculado exitosamente',
    schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174001' },
        serviceName: { type: 'string', example: 'Reparación de motor' },
        servicePrice: { type: 'number', example: 350.00 },
        totalPaid: { type: 'number', example: 120.00 },
        pendingAmount: { type: 'number', example: 230.00 },
        isFullyPaid: { type: 'boolean', example: false },
        paymentBreakdown: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid', example: 'pay-123-456' },
              type: { type: 'string', enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'YAPE', 'PLIN', 'OTRO'], example: 'EFECTIVO' },
              amount: { type: 'number', example: 120.00 },
              createdAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
            }
          },
          description: 'Lista de pagos realizados para este servicio'
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró el servicio especificado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Servicio con ID "123e4567-e89b-12d3-a456-426614174001" no encontrado' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tiene permisos para realizar esta acción',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No tienes permisos para ver el estado de pago de este servicio' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Formato de ID inválido',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Validation failed (uuid is expected)' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async getPendingPayment(@Param('id', ParseUUIDPipe) id: string): Promise<{
    serviceId: string;
    serviceName: string;
    servicePrice: number;
    totalPaid: number;
    pendingAmount: number;
    isFullyPaid: boolean;
    paymentBreakdown: Array<{
      id: string;
      type: string;
      amount: number;
      createdAt: string;
    }>;
  }> {
    return this.serviceService.getPendingPayment(id);
  }

  @Get('findAllWithClients')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Obtener servicios con información de clientes',
    description: 'Obtiene una lista de servicios con información adicional de clientes y órdenes. Permite filtrar por estado, tipo de servicio y tienda. Los usuarios ADMIN pueden ver todos los servicios, mientras que los USER solo pueden ver los servicios de sus órdenes.'
  })
  @ApiQuery({ 
    name: 'status', 
    required: false, 
    enum: ServiceStatus, 
    description: 'Filtrar servicios por estado actual',
    example: 'IN_PROGRESS',
    schema: {
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: null
    }
  })
  @ApiQuery({ 
    name: 'type', 
    required: false, 
    enum: ServiceType, 
    description: 'Filtrar servicios por tipo de servicio',
    example: 'REPAIR',
    schema: {
      enum: ['REPAIR', 'MAINTENANCE', 'INSPECTION', 'CUSTOM'],
      default: null
    }
  })
  @ApiQuery({ 
    name: 'storeId', 
    required: false, 
    type: 'string',
    format: 'uuid',
    description: 'Filtrar servicios por tienda específica',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de servicios con clientes obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174001' },
          type: { type: 'string', enum: Object.values(ServiceType), example: 'REPAIR' },
          status: { type: 'string', enum: Object.values(ServiceStatus), example: 'IN_PROGRESS' },
          name: { type: 'string', example: 'Reparación completa del motor' },
          description: { type: 'string', example: 'Revisión completa del motor' },
          photoUrls: { type: 'array', items: { type: 'string' }, example: ['https://supabase-url.com/photo1.jpg'] },
          price: { type: 'number', example: 250.00 },
          orderId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          client: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid', example: 'client-123' },
              name: { type: 'string', example: 'Juan Pérez' },
              email: { type: 'string', example: 'juan@ejemplo.com' },
              phone: { type: 'string', example: '+1234567890' },
              address: { type: 'string', example: 'Av. Principal 123' }
            }
          },
          order: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
              clientId: { type: 'string', format: 'uuid', example: 'client-123' },
              totalAmount: { type: 'number', example: 500.00 },
              status: { type: 'string', example: 'PENDING' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Parámetros de filtrado inválidos',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Valor de estado no válido' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async findAllWithClients(
    @Query('status') status?: ServiceStatus,
    @Query('type') type?: ServiceType,
    @Query('storeId') storeId?: string,
  ): Promise<any[]> {
    return this.serviceService.findAllWithClients(status, type, storeId);
  }
}
