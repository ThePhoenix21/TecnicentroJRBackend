import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';

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
  constructor(private readonly orderService: OrderService) {}

  /**
   * Crea una nueva orden en el sistema
   * @param req - Objeto de solicitud HTTP que contiene el token JWT
   * @param createOrderDto - Datos de la orden a crear
   * @returns La orden creada con sus relaciones
   * @throws BadRequestException Si los datos de entrada son inválidos
   * @throws NotFoundException Si algún producto no existe o no hay suficiente stock
   */
  @Post('create')
  @Roles(Role.ADMIN, Role.USER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Crear una nueva orden',
    description: 'Crea una nueva orden con productos y servicios. Se puede crear un nuevo cliente o usar uno existente.'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'La orden ha sido creada exitosamente',
    type: Order,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos o insuficiente stock',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Alguno de los productos no existe o el cliente no fue encontrado',
  })
  @ApiBody({ 
    type: CreateOrderDto,
    description: 'Datos de la orden a crear',
    examples: {
      'Orden con cliente nuevo': {
        value: {
          clientInfo: {
            name: 'Juan Pérez',
            email: 'juan@example.com',
            phone: '123456789',
            address: 'Calle Falsa 123',
            dni: '12345678'
          },
          products: [
            { productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 }
          ],
          services: [
            {
              name: 'Reparación de pantalla',
              description: 'Cambio de pantalla rota',
              price: 150.00,
              type: 'REPAIR',
              photoUrls: ['url1.jpg', 'url2.jpg']
            }
          ]
        }
      },
      'Orden con cliente existente': {
        value: {
          clientId: '123e4567-e89b-12d3-a456-426614174000',
          products: [
            { productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }
          ],
          services: []
        }
      }
    }
  })
  async create(
    @Req() req: any,
    @Body() createOrderDto: CreateOrderDto,
  ): Promise<Order> {
    // Extraer el ID del usuario del token JWT
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('No se pudo obtener el ID del usuario del token JWT');
    }

    // Asignar el ID del usuario al DTO
    createOrderDto.userId = userId;
    
    return this.orderService.create(createOrderDto);
  }

  @Get('all')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener todas las órdenes del usuario' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de órdenes obtenida exitosamente',
    type: [Order],
  })
  async findAll(@Req() req: any): Promise<Order[]> {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      throw new Error('No se pudo obtener el ID del usuario del token JWT');
    }
    return this.orderService.findAll(userId);
  }

  @Get('get/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener una orden por ID' })
  @ApiParam({ name: 'id', description: 'ID de la orden', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Orden encontrada',
    type: Order,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Orden no encontrada',
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
}
