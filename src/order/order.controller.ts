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
import { SaleStatus } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ServiceType, PaymentSourceType, PaymentType } from '@prisma/client';
import { Order } from './entities/order.entity';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { AuthService } from '../auth/auth.service';
import { PaymentService, CreatePaymentDto } from '../payment/payment.service';
import { CashMovementService } from '../cash-movement/cash-movement.service';

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
    private readonly supabaseStorage: SupabaseStorageService,
    private readonly authService: AuthService,
    private readonly paymentService: PaymentService,
    private readonly cashMovementService: CashMovementService
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
  // Para subir fotos, usa el endpoint específico de carga de imágenes
  // y luego incluye las URLs en el campo photoUrls del servicio correspondiente
  @ApiOperation({ 
    summary: 'Crear una nueva orden',
    description: `Crea una nueva orden con productos, servicios y fotos opcionales.\n\n` +
    `**Requisitos de autenticación:**\n` +
    `- Se requiere token JWT válido en el header 'Authorization'\n` +
    `- Roles permitidos: ADMIN o USER\n\n` +
    `**Límites de archivos:**\n` +
    `- Máximo 10 archivos por orden\n` +
    `- Tamaño máximo por archivo: 10MB\n` +
    `- Formatos permitidos: jpg, jpeg, png, gif, webp`
  })
  @ApiBearerAuth()
  @ApiConsumes('application/json')
  @ApiBody({
    description: 'Datos para crear una nueva orden',
    schema: {
      type: 'object',
      required: ['clientInfo', 'products'],
      properties: {
        clientInfo: {
          type: 'object',
          required: ['name', 'dni'],
          properties: {
            name: { type: 'string', example: 'Cliente Nuevo' },
            email: { 
              type: 'string', 
              format: 'email',
              example: 'cliente@ejemplo.com',
              description: 'Opcional, pero recomendado para notificaciones'
            },
            phone: { 
              type: 'string', 
              example: '999999999',
              description: 'Opcional, pero recomendado para contacto'
            },
            address: { 
              type: 'string',
              example: 'Av. Principal 123',
              description: 'Opcional, dirección del cliente'
            },
            dni: { 
              type: 'string',
              example: '12345678',
              description: 'DNI del cliente (requerido)'
            },
            ruc: { 
              type: 'string',
              example: '20123456781',
              description: 'Opcional, solo si el cliente tiene RUC'
            }
          }
        },
        products: {
          type: 'array',
          minItems: 0,
          items: {
            type: 'object',
            required: ['productId', 'quantity'],
            properties: {
              productId: { 
                type: 'string',
                format: 'uuid',
                example: '550e8400-e29b-41d4-a716-446655440000'
              },
              quantity: { 
                type: 'integer',
                minimum: 1,
                example: 2
              },
              price: {
                type: 'number',
                minimum: 0,
                description: 'Opcional, sobreescribe el precio del producto',
                example: 120.50
              },
              payments: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['type', 'amount'],
                  properties: {
                    type: {
                      type: 'string',
                      enum: Object.values(PaymentType),
                      example: 'EFECTIVO'
                    },
                    amount: {
                      type: 'number',
                      minimum: 0,
                      example: 241.00
                    }
                  }
                },
                description: 'Opcional, métodos de pago para este producto'
              }
            }
          }
        },
        services: {
          type: 'array',
          minItems: 0,
          items: {
            type: 'object',
            required: ['name', 'price', 'type'],
            properties: {
              name: { 
                type: 'string',
                example: 'Mantenimiento preventivo'
              },
              description: { 
                type: 'string',
                example: 'Limpieza y mantenimiento general'
              },
              price: { 
                type: 'number',
                minimum: 0,
                example: 150.50
              },
              type: { 
                type: 'string',
                enum: Object.values(ServiceType),
                example: 'MAINTENANCE'
              },
              photoUrls: {
                type: 'array',
                items: { type: 'string', format: 'uri' },
                description: 'URLs de fotos (se llenan automáticamente al subir archivos)'
              },
              payments: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['type', 'amount'],
                  properties: {
                    type: {
                      type: 'string',
                      enum: Object.values(PaymentType),
                      example: 'TARJETA'
                    },
                    amount: {
                      type: 'number',
                      minimum: 0,
                      example: 150.50
                    }
                  }
                },
                description: 'Opcional, métodos de pago para este servicio'
              }
            }
          }
        },
        orderNumber: {
          type: 'string',
          description: 'Opcional, se genera automáticamente si no se proporciona',
          example: 'ORD-2023-001'
        },
        status: {
          type: 'string',
          enum: Object.values(SaleStatus),
          default: 'PENDING',
          description: 'Estado de la orden',
          example: 'PENDING'
        }
      }
    },
    examples: {
      'Orden completa': {
        summary: 'Orden con productos y servicios',
        value: {
          clientInfo: {
            name: 'Juan Perez',
            email: 'juan.perez@example.com',
            phone: '987654321',
            address: 'Av. Siempre Viva 123',
            ruc: '20123456789',
            dni: '12345678'
          },
          products: [
            {
              productId: '11111111-1111-1111-1111-111111111111',
              quantity: 2,
              price: 150.5,
              payments: [
                {
                  type: 'EFECTIVO',
                  amount: 301.00
                }
              ]
            },
            {
              productId: '22222222-2222-2222-2222-222222222222',
              quantity: 1,
              payments: [
                {
                  type: 'TARJETA',
                  amount: 99.90
                },
                {
                  type: 'YAPE',
                  amount: 50.10
                }
              ]
            }
          ],
          services: [
            {
              name: 'Reparación de motor',
              description: 'Revisión completa del motor',
              price: 250.0,
              type: 'REPAIR',
              photoUrls: [
                'https://example.com/img1.jpg',
                'https://example.com/img2.jpg'
              ],
              payments: [
                {
                  type: 'TRANSFERENCIA',
                  amount: 250.0
                }
              ]
            },
            {
              name: 'Garantía extendida',
              price: 50.0,
              type: 'WARRANTY',
              photoUrls: [],
              payments: [
                {
                  type: 'EFECTIVO',
                  amount: 50.0
                }
              ]
            }
          ],
          userId: '33333333-3333-3333-3333-333333333333',
          status: 'PENDING'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Orden creada exitosamente', 
    schema: {
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        totalAmount: 320.50,
        status: 'PENDING',
        orderNumber: 'ORD-2023-001',
        clientId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        createdAt: '2023-11-21T16:30:00.000Z',
        updatedAt: '2023-11-21T16:30:00.000Z',
        orderProducts: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            orderId: '123e4567-e89b-12d3-a456-426614174000',
            productId: '550e8400-e29b-41d4-a716-446655440002',
            quantity: 2,
            price: 120.50,
            subtotal: 241.00,
            createdAt: '2023-11-21T16:30:00.000Z',
            updatedAt: '2023-11-21T16:30:00.000Z',
            payments: [
              {
                id: 'pay-001',
                type: 'EFECTIVO',
                amount: 241.00,
                sourceType: 'ORDERPRODUCT',
                sourceId: '550e8400-e29b-41d4-a716-446655440001',
                createdAt: '2023-11-21T16:30:00.000Z',
                updatedAt: '2023-11-21T16:30:00.000Z'
              }
            ]
          }
        ],
        services: [
          {
            id: '550e8400-e29b-41d4-a716-446655440003',
            orderId: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Mantenimiento preventivo',
            description: 'Limpieza y mantenimiento general',
            price: 150.50,
            type: 'MAINTENANCE',
            photoUrls: [
              'https://example.com/photos/orden-123e4567/photo1.jpg',
              'https://example.com/photos/orden-123e4567/photo2.jpg'
            ],
            createdAt: '2023-11-21T16:30:00.000Z',
            updatedAt: '2023-11-21T16:30:00.000Z',
            payments: [
              {
                id: 'pay-002',
                type: 'TARJETA',
                amount: 150.50,
                sourceType: 'SERVICE',
                sourceId: '550e8400-e29b-41d4-a716-446655440003',
                createdAt: '2023-11-21T16:30:00.000Z',
                updatedAt: '2023-11-21T16:30:00.000Z'
              }
            ]
          }
        ]
      }
    },
    headers: {
      'Location': {
        description: 'URL de la orden creada',
        schema: { 
          type: 'string', 
          format: 'uri',
          example: '/orders/123e4567-e89b-12d3-a456-426614174000'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos de entrada inválidos',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 400 },
            message: { type: 'string', example: 'Error de validación' },
            error: { type: 'string', example: 'Bad Request' },
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            details: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  property: { type: 'string' },
                  constraints: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'No autorizado - Se requiere autenticación',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 401 },
            message: { type: 'string', example: 'No autorizado' },
            error: { type: 'string', example: 'Unauthorized' }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 413, 
    description: 'El tamaño total de los archivos excede el límite de 50MB',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 413 },
            message: { type: 'string', example: 'El tamaño total de los archivos no puede exceder los 50MB' },
            error: { type: 'string', example: 'Payload Too Large' }
          }
        }
      }
    }
  })
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

      // Mapear price si está presente
      if (createOrderDto.products) {
        createOrderDto.products = createOrderDto.products.map(product => {
          // Si hay price, lo usamos como price
          if (product.price !== undefined) {
            return {
              ...product,
              customPrice: product.price
            };
          }
          return product;
        });
      }

      // Asignar el ID del usuario al DTO
      createOrderDto.userId = userId;

      // Procesar pagos para productos
      if (createOrderDto.products) {
        createOrderDto.products = createOrderDto.products.map(product => {
          const processedProduct: any = {
            ...product,
            // Si hay price personalizado, lo usaremos, el precio real se obtendrá del servicio
            ...(product.price !== undefined && { customPrice: product.price })
          };

          return processedProduct;
        });
      }

      // Procesar pagos para servicios
      if (createOrderDto.services) {
        createOrderDto.services = createOrderDto.services.map(service => {
          const processedService: any = { ...service };
          return processedService;
        });
      }

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
      
      // Guardar los pagos para productos
      const allPayments: CreatePaymentDto[] = [];
      
      // Extraer pagos de los productos originales
      if (body.products) {
        body.products.forEach((product, index) => {
          if (product.payments && product.payments.length > 0) {
            // El ID del OrderProduct se asignará después de crear la orden
            product.payments.forEach(payment => {
              allPayments.push({
                type: payment.type,
                amount: payment.amount,
                sourceType: 'ORDERPRODUCT' as any,
                sourceId: '', // Se asignará después
              });
            });
          }
        });
      }

      // Extraer pagos de los servicios originales
      if (body.services) {
        body.services.forEach((service, index) => {
          if (service.payments && service.payments.length > 0) {
            // El ID del Service se asignará después de crear la orden
            service.payments.forEach(payment => {
              allPayments.push({
                type: payment.type,
                amount: payment.amount,
                sourceType: 'SERVICE' as any,
                sourceId: '', // Se asignará después
              });
            });
          }
        });
      }

      // Crear la orden primero
      const createdOrder = await this.orderService.create(createOrderDto, req.user);

      // Ahora guardar los pagos con los IDs correctos
      if (allPayments.length > 0) {
        const paymentsToCreate: CreatePaymentDto[] = [];
        let paymentIndex = 0;

        // Asignar IDs para pagos de productos
        if (body.products && createdOrder.orderProducts && createdOrder.orderProducts.length > 0) {
          body.products.forEach((product, productIndex) => {
            if (product.payments && product.payments.length > 0 && productIndex < createdOrder.orderProducts!.length) {
              const orderProductId = createdOrder.orderProducts![productIndex]?.id;
              if (orderProductId) {
                product.payments.forEach(() => {
                  paymentsToCreate.push({
                    ...allPayments[paymentIndex],
                    sourceId: orderProductId,
                  });
                  paymentIndex++;
                });
              }
            }
          });
        }

        // Asignar IDs para pagos de servicios
        if (body.services && createdOrder.services && createdOrder.services.length > 0) {
          body.services.forEach((service, serviceIndex) => {
            if (service.payments && service.payments.length > 0 && serviceIndex < createdOrder.services!.length) {
              const serviceId = createdOrder.services![serviceIndex]?.id;
              if (serviceId) {
                service.payments.forEach(() => {
                  paymentsToCreate.push({
                    ...allPayments[paymentIndex],
                    sourceId: serviceId,
                  });
                  paymentIndex++;
                });
              }
            }
          });
        }

        // Crear todos los pagos
        await this.paymentService.createPayments(paymentsToCreate);

        // Debug: Verificar todos los pagos creados
        console.log('Todos los pagos a crear:', paymentsToCreate.map(p => ({ type: p.type, amount: p.amount })));

        // Crear movimientos de caja para pagos en efectivo
        const cashPayments = paymentsToCreate.filter(payment => payment.type === PaymentType.EFECTIVO);
        console.log('Pagos en efectivo detectados:', cashPayments.length, cashPayments.map(p => ({ type: p.type, amount: p.amount })));
        
        if (cashPayments.length > 0) {
          // Obtener información del cliente para los movimientos
          const orderWithClient = await this.orderService.findOne(createdOrder.id, req.user.userId);
          const clientInfo = orderWithClient.client;
          console.log('Información del cliente:', clientInfo ? { id: clientInfo.id, name: clientInfo.name } : 'No encontrado');

          for (const cashPayment of cashPayments) {
            try {
              console.log('Creando movimiento de caja:', {
                cashSessionId: createOrderDto.cashSessionId!,
                amount: cashPayment.amount,
                orderId: createdOrder.id,
                clientId: clientInfo?.id || undefined
              });
              
              await this.cashMovementService.createFromOrder({
                cashSessionId: createOrderDto.cashSessionId!,
                amount: cashPayment.amount,
                orderId: createdOrder.id,
                clientId: clientInfo?.id || undefined,
                clientName: clientInfo?.name || undefined,
                clientEmail: clientInfo?.email || undefined
              });
              
              console.log('Movimiento de caja creado exitosamente para monto:', cashPayment.amount);
            } catch (error) {
              // Si falla la creación del movimiento, loguear pero no fallar la orden
              console.error(`Error al crear movimiento de caja para pago ${cashPayment.amount}:`, error.message);
              console.error('Stack trace:', error.stack);
            }
          }
        } else {
          console.log('No se encontraron pagos en efectivo en esta orden');
        }
      }

      return createdOrder;
    } catch (error) {
      if (error instanceof HttpException) {
        // Si ya es una excepción HTTP, la devolvemos tal cual
        throw error;
      }
      
      // Manejar errores específicos de Prisma
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'El correo electrónico ya está registrado con un DNI diferente',
          error: 'Bad Request',
          code: 'EMAIL_ALREADY_EXISTS'
        });
      }
      
      // Para otros errores, devolvemos un mensaje genérico
      const errorMessage = error.message || 'Error desconocido al procesar la orden';
      throw new BadRequestException(`Error al procesar la orden: ${errorMessage}`);
    }
  }

  @Get('me')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener mis órdenes',
    description: 'Retorna un listado de todas las órdenes asociadas al usuario autenticado. Incluye información completa de cada orden con sus productos, servicios y pagos.'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar órdenes por estado (opcional)',
    example: 'PENDING',
    schema: {
      type: 'string',
      enum: ['PENDING', 'PAID', 'CANCELLED', 'COMPLETED'],
      description: 'Estados posibles de las órdenes'
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de órdenes del usuario obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID único de la orden' },
          totalAmount: { type: 'number', example: 700.50, description: 'Monto total de la orden' },
          status: { type: 'string', example: 'PENDING', enum: ['PENDING', 'PAID', 'CANCELLED', 'COMPLETED'], description: 'Estado de la orden' },
          orderNumber: { type: 'string', example: 'ORD-2023-001', description: 'Número único de orden' },
          clientId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001', description: 'ID del cliente' },
          userId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID del usuario que creó la orden' },
          cashSessionsId: { type: 'string', nullable: true, example: null, description: 'ID de la sesión de caja' },
          createdAt: { type: 'string', format: 'date-time', example: '2023-11-21T16:30:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2023-11-21T16:30:00.000Z' },
          orderProducts: {
            type: 'array',
            description: 'Productos de la orden',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
                productId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
                quantity: { type: 'number', example: 2, description: 'Cantidad del producto' },
                price: { type: 'number', example: 120.50, description: 'Precio unitario del producto' },
                subtotal: { type: 'number', example: 241.00, description: 'Subtotal del producto' },
                product: {
                  type: 'object',
                  description: 'Información del producto del catálogo',
                  properties: {
                    id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
                    name: { type: 'string', example: 'Aceite de Motor 10W40', description: 'Nombre del producto' },
                    description: { type: 'string', nullable: true, example: 'Aceite sintético de alta calidad' },
                    basePrice: { type: 'number', nullable: true, example: 29.99, description: 'Precio base del producto' },
                    buyCost: { type: 'number', nullable: true, example: 20.50, description: 'Costo de compra del producto' },
                    isDeleted: { type: 'boolean', example: false, description: 'Indica si el producto está eliminado' }
                  }
                },
                payments: {
                  type: 'array',
                  description: 'Pagos asociados al producto',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'pay-001' },
                      type: { type: 'string', example: 'EFECTIVO', enum: ['EFECTIVO', 'TARJETA', 'YAPE', 'TRANSFERENCIA', 'DEPOSITO'], description: 'Tipo de pago' },
                      amount: { type: 'number', example: 241.00, description: 'Monto del pago' },
                      sourceType: { type: 'string', example: 'ORDERPRODUCT', description: 'Tipo de origen del pago' },
                      sourceId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
                      createdAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          },
          services: {
            type: 'array',
            description: 'Servicios de la orden',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440003' },
                name: { type: 'string', example: 'Reparación de motor', description: 'Nombre del servicio' },
                description: { type: 'string', nullable: true, example: 'Revisión completa del motor', description: 'Descripción del servicio' },
                price: { type: 'number', example: 250.00, description: 'Precio del servicio' },
                type: { type: 'string', example: 'REPAIR', enum: ['MAINTENANCE', 'REPAIR', 'WARRANTY', 'OTHER'], description: 'Tipo de servicio' },
                photoUrls: { type: 'array', items: { type: 'string' }, example: ['https://example.com/img1.jpg'], description: 'URLs de fotos del servicio' },
                payments: {
                  type: 'array',
                  description: 'Pagos asociados al servicio',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'pay-002' },
                      type: { type: 'string', example: 'TRANSFERENCIA', description: 'Tipo de pago' },
                      amount: { type: 'number', example: 250.00, description: 'Monto del pago' },
                      sourceType: { type: 'string', example: 'SERVICE', description: 'Tipo de origen del pago' },
                      sourceId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440003' },
                      createdAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          },
          client: {
            type: 'object',
            nullable: true,
            description: 'Información del cliente',
            properties: {
              id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
              name: { type: 'string', example: 'Juan Perez', description: 'Nombre del cliente' },
              email: { type: 'string', nullable: true, example: 'juan.perez@example.com', description: 'Email del cliente' },
              phone: { type: 'string', nullable: true, example: '987654321', description: 'Teléfono del cliente' },
              address: { type: 'string', nullable: true, example: 'Av. Siempre Viva 123', description: 'Dirección del cliente' },
              dni: { type: 'string', example: '12345678', description: 'DNI del cliente' },
              ruc: { type: 'string', nullable: true, example: '20123456789', description: 'RUC del cliente (si aplica)' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para ver estas órdenes',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden resource',
        error: 'Forbidden'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'No se pudo obtener el ID del usuario',
    schema: {
      example: {
        statusCode: 400,
        message: 'No se pudo obtener el ID del usuario del token JWT',
        error: 'Bad Request'
      }
    }
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
  @Roles(Role.ADMIN)
  @ApiOperation({ 
    summary: 'Obtener todas las órdenes (solo administradores)',
    description: 'Retorna un listado completo de todas las órdenes del sistema. Solo disponible para administradores. Incluye información completa de cada orden con sus productos, servicios y pagos.'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar órdenes por estado (opcional)',
    example: 'PENDING',
    schema: {
      type: 'string',
      enum: ['PENDING', 'PAID', 'CANCELLED', 'COMPLETED'],
      description: 'Estados posibles de las órdenes'
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista completa de órdenes obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID único de la orden' },
          totalAmount: { type: 'number', example: 700.50, description: 'Monto total de la orden' },
          status: { type: 'string', example: 'PENDING', enum: ['PENDING', 'PAID', 'CANCELLED', 'COMPLETED'], description: 'Estado de la orden' },
          orderNumber: { type: 'string', example: 'ORD-2023-001', description: 'Número único de orden' },
          clientId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001', description: 'ID del cliente' },
          userId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID del usuario que creó la orden' },
          cashSessionsId: { type: 'string', nullable: true, example: null, description: 'ID de la sesión de caja' },
          createdAt: { type: 'string', format: 'date-time', example: '2023-11-21T16:30:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2023-11-21T16:30:00.000Z' },
          orderProducts: {
            type: 'array',
            description: 'Productos de la orden',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
                productId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
                quantity: { type: 'number', example: 2, description: 'Cantidad del producto' },
                price: { type: 'number', example: 120.50, description: 'Precio unitario del producto' },
                subtotal: { type: 'number', example: 241.00, description: 'Subtotal del producto' },
                product: {
                  type: 'object',
                  description: 'Información del producto del catálogo',
                  properties: {
                    id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
                    name: { type: 'string', example: 'Aceite de Motor 10W40', description: 'Nombre del producto' },
                    description: { type: 'string', nullable: true, example: 'Aceite sintético de alta calidad' },
                    basePrice: { type: 'number', nullable: true, example: 29.99, description: 'Precio base del producto' },
                    buyCost: { type: 'number', nullable: true, example: 20.50, description: 'Costo de compra del producto' },
                    isDeleted: { type: 'boolean', example: false, description: 'Indica si el producto está eliminado' }
                  }
                },
                payments: {
                  type: 'array',
                  description: 'Pagos asociados al producto',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'pay-001' },
                      type: { type: 'string', example: 'EFECTIVO', enum: ['EFECTIVO', 'TARJETA', 'YAPE', 'TRANSFERENCIA', 'DEPOSITO'], description: 'Tipo de pago' },
                      amount: { type: 'number', example: 241.00, description: 'Monto del pago' },
                      sourceType: { type: 'string', example: 'ORDERPRODUCT', description: 'Tipo de origen del pago' },
                      sourceId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
                      createdAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          },
          services: {
            type: 'array',
            description: 'Servicios de la orden',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440003' },
                name: { type: 'string', example: 'Reparación de motor', description: 'Nombre del servicio' },
                description: { type: 'string', nullable: true, example: 'Revisión completa del motor', description: 'Descripción del servicio' },
                price: { type: 'number', example: 250.00, description: 'Precio del servicio' },
                type: { type: 'string', example: 'REPAIR', enum: ['MAINTENANCE', 'REPAIR', 'WARRANTY', 'OTHER'], description: 'Tipo de servicio' },
                photoUrls: { type: 'array', items: { type: 'string' }, example: ['https://example.com/img1.jpg'], description: 'URLs de fotos del servicio' },
                payments: {
                  type: 'array',
                  description: 'Pagos asociados al servicio',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'pay-002' },
                      type: { type: 'string', example: 'TRANSFERENCIA', description: 'Tipo de pago' },
                      amount: { type: 'number', example: 250.00, description: 'Monto del pago' },
                      sourceType: { type: 'string', example: 'SERVICE', description: 'Tipo de origen del pago' },
                      sourceId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440003' },
                      createdAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          },
          client: {
            type: 'object',
            nullable: true,
            description: 'Información del cliente',
            properties: {
              id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
              name: { type: 'string', example: 'Juan Perez', description: 'Nombre del cliente' },
              email: { type: 'string', nullable: true, example: 'juan.perez@example.com', description: 'Email del cliente' },
              phone: { type: 'string', nullable: true, example: '987654321', description: 'Teléfono del cliente' },
              address: { type: 'string', nullable: true, example: 'Av. Siempre Viva 123', description: 'Dirección del cliente' },
              dni: { type: 'string', example: '12345678', description: 'DNI del cliente' },
              ruc: { type: 'string', nullable: true, example: '20123456789', description: 'RUC del cliente (si aplica)' }
            }
          },
          user: {
            type: 'object',
            nullable: true,
            description: 'Información del usuario que creó la orden',
            properties: {
              id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
              name: { type: 'string', example: 'Admin User', description: 'Nombre del usuario' },
              email: { type: 'string', example: 'admin@example.com', description: 'Email del usuario' },
              role: { type: 'string', example: 'ADMIN', description: 'Rol del usuario' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos de administrador',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden resource',
        error: 'Forbidden'
      }
    }
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
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID único de la orden' },
        totalAmount: { type: 'number', example: 700.50, description: 'Monto total de la orden' },
        status: { type: 'string', example: 'PENDING', enum: ['PENDING', 'PAID', 'CANCELLED', 'COMPLETED'], description: 'Estado de la orden' },
        orderNumber: { type: 'string', example: 'ORD-2023-001', description: 'Número único de orden' },
        clientId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001', description: 'ID del cliente' },
        userId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID del usuario que creó la orden' },
        cashSessionsId: { type: 'string', nullable: true, example: null, description: 'ID de la sesión de caja' },
        createdAt: { type: 'string', format: 'date-time', example: '2023-11-21T16:30:00.000Z' },
        updatedAt: { type: 'string', format: 'date-time', example: '2023-11-21T16:30:00.000Z' },
        orderProducts: {
          type: 'array',
          description: 'Productos de la orden',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
              productId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
              quantity: { type: 'number', example: 2, description: 'Cantidad del producto' },
              price: { type: 'number', example: 120.50, description: 'Precio unitario del producto' },
              subtotal: { type: 'number', example: 241.00, description: 'Subtotal del producto' },
              product: {
                type: 'object',
                description: 'Información del producto del catálogo',
                properties: {
                  id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
                  name: { type: 'string', example: 'Aceite de Motor 10W40', description: 'Nombre del producto' },
                  description: { type: 'string', nullable: true, example: 'Aceite sintético de alta calidad' },
                  basePrice: { type: 'number', nullable: true, example: 29.99, description: 'Precio base del producto' },
                  buyCost: { type: 'number', nullable: true, example: 20.50, description: 'Costo de compra del producto' },
                  isDeleted: { type: 'boolean', example: false, description: 'Indica si el producto está eliminado' }
                }
              },
              payments: {
                type: 'array',
                description: 'Pagos asociados al producto',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', example: 'pay-001' },
                    type: { type: 'string', example: 'EFECTIVO', enum: ['EFECTIVO', 'TARJETA', 'YAPE', 'TRANSFERENCIA', 'DEPOSITO'], description: 'Tipo de pago' },
                    amount: { type: 'number', example: 241.00, description: 'Monto del pago' },
                    sourceType: { type: 'string', example: 'ORDERPRODUCT', description: 'Tipo de origen del pago' },
                    sourceId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
                    createdAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        },
        services: {
          type: 'array',
          description: 'Servicios de la orden',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440003' },
              name: { type: 'string', example: 'Reparación de motor', description: 'Nombre del servicio' },
              description: { type: 'string', nullable: true, example: 'Revisión completa del motor', description: 'Descripción del servicio' },
              price: { type: 'number', example: 250.00, description: 'Precio del servicio' },
              type: { type: 'string', example: 'REPAIR', enum: ['MAINTENANCE', 'REPAIR', 'WARRANTY', 'OTHER'], description: 'Tipo de servicio' },
              photoUrls: { type: 'array', items: { type: 'string' }, example: ['https://example.com/img1.jpg'], description: 'URLs de fotos del servicio' },
              payments: {
                type: 'array',
                description: 'Pagos asociados al servicio',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', example: 'pay-002' },
                    type: { type: 'string', example: 'TRANSFERENCIA', description: 'Tipo de pago' },
                    amount: { type: 'number', example: 250.00, description: 'Monto del pago' },
                    sourceType: { type: 'string', example: 'SERVICE', description: 'Tipo de origen del pago' },
                    sourceId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440003' },
                    createdAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        },
        client: {
          type: 'object',
          nullable: true,
          description: 'Información del cliente',
          properties: {
            id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
            name: { type: 'string', example: 'Juan Perez', description: 'Nombre del cliente' },
            email: { type: 'string', nullable: true, example: 'juan.perez@example.com', description: 'Email del cliente' },
            phone: { type: 'string', nullable: true, example: '987654321', description: 'Teléfono del cliente' },
            address: { type: 'string', nullable: true, example: 'Av. Siempre Viva 123', description: 'Dirección del cliente' },
            dni: { type: 'string', example: '12345678', description: 'DNI del cliente' },
            ruc: { type: 'string', nullable: true, example: '20123456789', description: 'RUC del cliente (si aplica)' }
          }
        },
        user: {
          type: 'object',
          nullable: true,
          description: 'Información del usuario que creó la orden',
          properties: {
            id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
            name: { type: 'string', example: 'Admin User', description: 'Nombre del usuario' },
            email: { type: 'string', example: 'admin@example.com', description: 'Email del usuario' },
            role: { type: 'string', example: 'ADMIN', description: 'Rol del usuario' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'La orden no existe o no tiene permisos para verla',
    schema: {
      examples: {
        noEncontrada: {
          summary: 'Orden no encontrada',
          value: {
            statusCode: 404,
            message: 'Orden con ID 123e4567-e89b-12d3-a456-426614174000 no encontrada',
            error: 'Not Found'
          }
        },
        sinPermisos: {
          summary: 'No tiene permisos para ver esta orden',
          value: {
            statusCode: 404,
            message: 'Orden con ID 123e4567-e89b-12d3-a456-426614174000 no encontrada',
            error: 'Not Found'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'ID de orden inválido',
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed (uuid is expected)',
        error: 'Bad Request'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para ver esta orden',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden resource',
        error: 'Forbidden'
      }
    }
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
    description: 'Datos para actualizar el estado de la orden',
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: ['PENDING', 'PAID', 'CANCELLED', 'COMPLETED'],
          example: 'COMPLETED',
          description: 'Nuevo estado de la orden'
        },
        comment: {
          type: 'string',
          nullable: true,
          example: 'La orden ha sido completada exitosamente',
          description: 'Comentario opcional sobre el cambio de estado'
        }
      }
    },
    examples: {
      marcarPagada: {
        summary: 'Marcar orden como pagada',
        value: {
          status: 'PAID',
          comment: 'Pago recibido y verificado'
        }
      },
      marcarCompletada: {
        summary: 'Marcar orden como completada',
        value: {
          status: 'COMPLETED',
          comment: 'La orden ha sido completada exitosamente'
        }
      },
      marcarCancelada: {
        summary: 'Marcar orden como cancelada',
        value: {
          status: 'CANCELLED',
          comment: 'Cancelación solicitada por el cliente'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Estado de la orden actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID único de la orden' },
        totalAmount: { type: 'number', example: 700.50, description: 'Monto total de la orden' },
        status: { type: 'string', example: 'COMPLETED', enum: ['PENDING', 'PAID', 'CANCELLED', 'COMPLETED'], description: 'Estado actualizado de la orden' },
        orderNumber: { type: 'string', example: 'ORD-2023-001', description: 'Número único de orden' },
        clientId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001', description: 'ID del cliente' },
        userId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID del usuario que creó la orden' },
        cashSessionsId: { type: 'string', nullable: true, example: null, description: 'ID de la sesión de caja' },
        createdAt: { type: 'string', format: 'date-time', example: '2023-11-21T16:30:00.000Z' },
        updatedAt: { type: 'string', format: 'date-time', example: '2023-11-21T18:30:00.000Z' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'La orden no existe o no tiene permisos para actualizarla',
    schema: {
      examples: {
        noEncontrada: {
          summary: 'Orden no encontrada',
          value: {
            statusCode: 404,
            message: 'Orden con ID 123e4567-e89b-12d3-a456-426614174000 no encontrada',
            error: 'Not Found'
          }
        },
        sinPermisos: {
          summary: 'No tiene permisos para actualizar esta orden',
          value: {
            statusCode: 404,
            message: 'Orden con ID 123e4567-e89b-12d3-a456-426614174000 no encontrada',
            error: 'Not Found'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos o estado no válido',
    schema: {
      examples: {
        estadoInvalido: {
          summary: 'Estado no válido',
          value: {
            statusCode: 400,
            message: 'Estado inválido. Debe ser uno de: PENDING, PAID, CANCELLED, COMPLETED',
            error: 'Bad Request'
          }
        },
        datosInvalidos: {
          summary: 'Campos requeridos faltantes',
          value: {
            statusCode: 400,
            message: 'El campo status es requerido',
            error: 'Bad Request'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para actualizar esta orden',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden resource',
        error: 'Forbidden'
      }
    }
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

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Anular una orden',
    description: 'Anula una orden existente y todos sus servicios asociados. Requiere autenticación con correo y contraseña para seguridad adicional. Solo el propietario o un administrador pueden anular una orden.'
  })
  @ApiParam({
    name: 'id',
    description: 'ID único de la orden a anular',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true
  })
  @ApiBody({
    description: 'Credenciales para anular la orden',
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'usuario@ejemplo.com',
          description: 'Correo electrónico del usuario'
        },
        password: {
          type: 'string',
          example: 'contraseña123',
          description: 'Contraseña del usuario'
        },
        reason: {
          type: 'string',
          nullable: true,
          example: 'Cliente solicitó cancelación',
          description: 'Motivo de la anulación (opcional)'
        }
      }
    },
    examples: {
      cancelacionCliente: {
        summary: 'Anulación por solicitud del cliente',
        value: {
          email: 'usuario@ejemplo.com',
          password: 'contraseña123',
          reason: 'Cliente solicitó cancelación'
        }
      },
      cancelacionAdmin: {
        summary: 'Anulación por administrador',
        value: {
          email: 'admin@ejemplo.com',
          password: 'admin123',
          reason: 'Cancelación administrativa por falta de pago'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Orden anulada exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID único de la orden' },
        totalAmount: { type: 'number', example: 700.50, description: 'Monto total de la orden' },
        status: { type: 'string', example: 'CANCELLED', enum: ['PENDING', 'PAID', 'CANCELLED', 'COMPLETED'], description: 'Estado actualizado de la orden' },
        orderNumber: { type: 'string', example: 'ORD-2023-001', description: 'Número único de orden' },
        clientId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001', description: 'ID del cliente' },
        userId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID del usuario que creó la orden' },
        cashSessionsId: { type: 'string', nullable: true, example: null, description: 'ID de la sesión de caja' },
        createdAt: { type: 'string', format: 'date-time', example: '2023-11-21T16:30:00.000Z' },
        updatedAt: { type: 'string', format: 'date-time', example: '2023-11-21T18:30:00.000Z' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'La orden no existe o no tiene permisos para anularla',
    schema: {
      examples: {
        noEncontrada: {
          summary: 'Orden no encontrada',
          value: {
            statusCode: 404,
            message: 'Orden con ID 123e4567-e89b-12d3-a456-426614174000 no encontrada',
            error: 'Not Found'
          }
        },
        sinPermisos: {
          summary: 'No tiene permisos para anular esta orden',
          value: {
            statusCode: 404,
            message: 'Orden con ID 123e4567-e89b-12d3-a456-426614174000 no encontrada',
            error: 'Not Found'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'La orden ya está anulada o credenciales inválidas',
    schema: {
      examples: {
        yaAnulada: {
          summary: 'Orden ya anulada',
          value: {
            statusCode: 400,
            message: 'La orden ya está anulada',
            error: 'Bad Request'
          }
        },
        credencialesInvalidas: {
          summary: 'Credenciales inválidas',
          value: {
            statusCode: 401,
            message: 'Credenciales inválidas',
            error: 'Unauthorized'
          }
        },
        datosInvalidos: {
          summary: 'Campos requeridos faltantes',
          value: {
            statusCode: 400,
            message: 'El campo email es requerido',
            error: 'Bad Request'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para anular esta orden',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden resource',
        error: 'Forbidden'
      }
    }
  })
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cancelOrderDto: CancelOrderDto,
    @Req() req: any,
  ): Promise<Order> {
    // Verificar credenciales del usuario
    const user = await this.authService.validateUser(
      cancelOrderDto.email,
      cancelOrderDto.password
    );

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    
    return this.orderService.cancelOrder(id, user.id, user.role, req.user);
  }
}
