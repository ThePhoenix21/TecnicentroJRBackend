import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  Query, 
  Param, 
  UseGuards, 
  Req, 
  HttpCode, 
  HttpStatus, 
  ParseUUIDPipe,
  Put,
  Delete,
  UseInterceptors,
  UnauthorizedException,
  PayloadTooLargeException,
  HttpException,
  BadRequestException,
  UploadedFiles,
  Patch
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery, ApiParam, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ServiceType } from '@prisma/client';
import { Order } from './entities/order.entity';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

// Definir el tipo para el usuario autenticado
interface RequestWithUser extends Request {
  user: {
    id: string;
    roles?: string[];
  };
}

// Interfaz para los archivos subidos
interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/**
 * Controlador para gestionar las operaciones relacionadas con las órdenes
 * Este controlador requiere autenticación JWT y los roles adecuados
 */
@ApiTags('Órdenes')
@ApiBearerAuth('JWT')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ 
  status: HttpStatus.UNAUTHORIZED, 
  description: 'Se requiere un token JWT válido para acceder a este recurso' 
})
@ApiResponse({ 
  status: HttpStatus.FORBIDDEN, 
  description: 'El usuario no tiene los permisos necesarios para realizar esta acción' 
})
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly supabaseStorage: SupabaseStorageService
  ) {}

  /**
   * Crea una nueva orden en el sistema con productos, servicios y fotos opcionales.
   * 
   * @example
   * // Ejemplo de solicitud con productos y servicios:
   * // POST /orders/create
   * // Headers: { "Authorization": "Bearer token" }
   * // Body (form-data):
   * //   - clientId: "123e4567-e89b-12d3-a456-426614174000"
   * //   - products: [{"productId": "...", "quantity": 2}]
   * //   - services: [{"name": "Mantenimiento", "price": 100, "type": "MAINTENANCE"}]
   * //   - photos: [imagen1.jpg, imagen2.jpg] (opcional, máximo 5)
   * 
   * @example
   * // Ejemplo de solicitud solo con fotos (crea un servicio automático):
   * // POST /orders/create
   * // Headers: { "Authorization": "Bearer token" }
   * // Body (form-data):
   * //   - clientId: "123e4567-e89b-12d3-a456-426614174000"
   * //   - photos: [evidencia1.jpg, evidencia2.jpg] (máximo 5)
   * 
   * @param req - Objeto de solicitud HTTP que contiene el token JWT
   * @param createOrderDto - Datos de la orden a crear
   * @param files - Archivos adjuntos (fotos) de la orden
   * @returns La orden creada con sus relaciones
   * @throws BadRequestException - Cuando los datos de entrada son inválidos o hay error al procesar imágenes
   * @throws NotFoundException - Cuando algún producto no existe o no hay suficiente stock
   * @throws PayloadTooLargeException - Cuando el tamaño total de los archivos excede 50MB
   * @throws UnauthorizedException - Cuando el usuario no está autenticado
   */
  @Post('create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.USER)
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'photos', maxCount: 10 }],
      {
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB por archivo
          files: 10 // Máximo 10 archivos
        },
        fileFilter: (req, file, callback) => {
          if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
            return callback(new Error('Solo se permiten imágenes'), false);
          }
          callback(null, true);
        }
      }
    )
  )
  @ApiOperation({ 
    summary: 'Crear una nueva orden',
    description: `Crea una nueva orden con la información proporcionada.`
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        createOrderDto: { 
          type: 'string',
          format: 'json',
          description: 'JSON string del objeto CreateOrderDto'
        },
        photos: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary'
          },
          description: 'Fotos opcionales para la orden'
        }
      },
      required: ['createOrderDto']
    },
    examples: {
      'Orden con productos y servicios': {
        value: {
          createOrderDto: JSON.stringify({
            clientId: '123e4567-e89b-12d3-a456-426614174000',
            description: 'Reparación de laptop y mantenimiento',
            services: [
              {
                name: 'Mantenimiento preventivo',
                description: 'Limpieza y mantenimiento general',
                price: 150.50,
                type: 'MAINTENANCE'
              }
            ]
          }, null, 2)
        }
      },
      'Orden solo con fotos': {
        value: {
          createOrderDto: JSON.stringify({
            clientId: '123e4567-e89b-12d3-a456-426614174000',
            description: 'Orden con evidencia fotográfica'
          }, null, 2)
        }
      }
    }
  })
  @ApiResponse({ status: 201, description: 'Orden creada exitosamente', type: Order })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 413, description: 'Tamaño de archivo excede el límite' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: Request & { user: { userId: string; email: string; role: Role } },
    @Body() body: CreateOrderDto,
    @UploadedFiles() files: { photos?: UploadedFile[] },
  ): Promise<Order> {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    try {
      // Crear instancia del DTO
      const createOrderDto = plainToInstance(CreateOrderDto, body);

      // Validar el DTO manualmente
      const errors = await validate(createOrderDto, { 
        validationError: { target: false },
        whitelist: true,
        forbidNonWhitelisted: true
      });

      if (errors.length > 0) {
        throw new BadRequestException(errors);
      }

      // Mapear customPrice a price si está presente
      if (createOrderDto.products) {
        createOrderDto.products = createOrderDto.products.map(product => {
          // Si hay customPrice, lo usamos como price
          if (product.customPrice !== undefined) {
            return {
              ...product,
              price: product.customPrice
            };
          }
          return product;
        });
      }

      // Asignar el ID del usuario al DTO
      createOrderDto.userId = userId;

      // Procesar fotos si se enviaron
      if (files?.photos?.length) {
        // Validar el tamaño total de los archivos
        const totalSize = files.photos.reduce((acc, file) => acc + file.size, 0);
        if (totalSize > 50 * 1024 * 1024) { // 50MB máximo en total
          throw new PayloadTooLargeException('El tamaño total de los archivos no puede exceder los 50MB');
        }

        // Subir fotos a Supabase
        const photoUrls = await this.supabaseStorage.uploadServicePhotos(
          files.photos.map(file => ({
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype
          }))
        );
        
        // Asignar las URLs de las fotos al primer servicio de la orden
        if (createOrderDto.services?.length) {
          createOrderDto.services[0].photoUrls = [
            ...(createOrderDto.services[0].photoUrls || []),
            ...photoUrls
          ];
        } else if (photoUrls.length > 0) {
          // Si no hay servicios pero hay fotos, crear un servicio para las fotos
          createOrderDto.services = [{
            name: 'Servicio con evidencia fotográfica',
            description: 'Servicio con imágenes adjuntas',
            price: 0,
            type: 'OTHER' as ServiceType,
            photoUrls: photoUrls
          }];
        }
      }
      
      return await this.orderService.create(createOrderDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(`Error al procesar la orden: ${error.message}`);
    }
  }

  @Get('me')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener mis órdenes',
    description: 'Retorna un listado de todas las órdenes asociadas al usuario autenticado.'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar órdenes por estado (opcional)',
    example: 'PENDING',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de órdenes obtenida exitosamente',
    type: [Order],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Usuario no autenticado',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para ver estas órdenes',
  })
  async findMyOrders(
    @Req() req: any,
    @Query('status') status?: string,
  ): Promise<Order[]> {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      throw new BadRequestException('No se pudo obtener el ID del usuario del token JWT');
    }
    return this.orderService.findMe(userId);
  }

  @Get('all')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener todas las órdenes (solo administradores)',
    description: 'Retorna un listado completo de todas las órdenes del sistema. Solo disponible para administradores.'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar órdenes por estado (opcional)',
    example: 'PENDING',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista completa de órdenes obtenida exitosamente',
    type: [Order],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Usuario no autenticado',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos de administrador',
  })
  async findAll(
    @Query('status') status?: string,
  ): Promise<Order[]> {
    return this.orderService.findAll();
  }

  @Get('get/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener una orden por ID',
    description: 'Obtiene los detalles completos de una orden específica por su ID. Los usuarios solo pueden ver sus propias órdenes, a menos que sean administradores.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID único de la orden (UUID)', 
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true 
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Orden encontrada exitosamente',
    type: Order,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'La orden no existe o no tiene permisos para verla',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'ID de orden inválido',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Usuario no autenticado',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para ver esta orden',
  })
  async findOne(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Order> {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      throw new Error('No se pudo obtener el ID del usuario del token JWT');
    }
    return this.orderService.findOne(id, userId);
  }

  @Patch('status/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Actualizar el estado de una orden',
    description: 'Actualiza el estado de una orden existente. Los usuarios solo pueden actualizar sus propias órdenes, a menos que sean administradores.'
  })
  @ApiParam({
    name: 'id',
    description: 'ID único de la orden a actualizar',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true
  })
  @ApiBody({
    type: UpdateOrderStatusDto,
    description: 'Datos para actualizar el estado de la orden',
    examples: {
      actualizacionEstado: {
        summary: 'Actualización de estado',
        value: {
          status: 'COMPLETED',
          comment: 'La orden ha sido completada exitosamente'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Estado de la orden actualizado exitosamente',
    type: Order,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'La orden no existe o no tiene permisos para actualizarla',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Usuario no autenticado',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para actualizar esta orden',
  })
  async updateStatus(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto
  ): Promise<Order> {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('No se pudo obtener el ID del usuario del token JWT');
    }
    
    return this.orderService.updateStatus(id, userId, updateOrderStatusDto);
  }
}
