import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { SaleService } from './sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { AnnulSaleDto } from './dto/annul-sale.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Sale } from './entities/sale.entity';

type SaleResponse = { data: Sale };
type SaleListResponse = { data: Sale[]; total: number };

@ApiTags('Ventas')
@Controller('sales')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: 'Se requiere autenticación mediante JWT' })
export class SaleController {
  constructor(private readonly saleService: SaleService) {}

  /**
   * Crea una nueva venta
   * @param req - Objeto de solicitud que contiene el token JWT
   * @param createSaleDto - Datos de la venta a crear
   * @returns La venta creada
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Crear una nueva venta',
    description: 'Crea una nueva venta en el sistema. Requiere autenticación JWT y rol de USUARIO o ADMIN.',
    operationId: 'createSale',
  })
  @ApiBody({
    type: CreateSaleDto,
    description: 'Datos de la venta a crear. El monto total se calculará automáticamente basado en el precio del producto y la cantidad.',
    examples: {
      ejemplo1: {
        summary: 'Venta básica',
        value: {
          productId: '123e4567-e89b-12d3-a456-426614174000',
          quantity: 2
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Venta creada exitosamente',
    type: Sale,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos o stock insuficiente',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Producto no encontrado',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado. Se requiere autenticación',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para realizar esta acción. Se requiere rol de USUARIO o ADMIN.',
  })
  async create(
    @Request() req: any,
    @Body() createSaleDto: CreateSaleDto,
  ): Promise<SaleResponse> {
    const userId = req.user.userId;
    const sale = await this.saleService.create(createSaleDto, userId);
    return { data: sale };
  }

  /**
   * Obtiene todas las ventas con soporte para paginación y búsqueda
   * @param paginationDto - Parámetros de paginación y búsqueda
   * @returns Lista paginada de ventas y total de registros
   */
  @Get('list')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener todas las ventas',
    description: 'Retorna una lista paginada de todas las ventas en el sistema. Solo accesible por administradores.',
    operationId: 'getAllSales',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número de página (por defecto: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Cantidad de registros por página (por defecto: 10, máximo: 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Término de búsqueda para filtrar ventas por nombre de producto o cliente',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de ventas obtenida exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para realizar esta acción. Se requiere rol de ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado. Se requiere autenticación',
  })
  async findAll(@Query() paginationDto: PaginationDto): Promise<SaleListResponse> {
    return this.saleService.findAll(paginationDto);
  }

  /**
   * Obtiene las ventas de un usuario específico por su ID
   * Solo accesible por administradores
   * @param userId - ID del usuario cuyas ventas se desean consultar
   * @param paginationDto - Parámetros de paginación y búsqueda
   * @returns Lista paginada de ventas del usuario y total de registros
   */
  @Get('user-sales/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener ventas por ID de usuario',
    description: 'Retorna las ventas realizadas por un usuario específico. Solo accesible para administradores.',
    operationId: 'getUserSales',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID del usuario cuyas ventas se desean consultar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número de página (por defecto: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Cantidad de registros por página (por defecto: 10, máximo: 100)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de ventas del usuario obtenida exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado. Se requiere autenticación',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para acceder a este recurso. Se requiere rol de ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No se encontró el usuario con el ID especificado',
  })
  async findUserSales(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() paginationDto: PaginationDto,
  ): Promise<SaleListResponse> {
    return this.saleService.findByUserId(userId, paginationDto);
  }

  /**
   * Obtiene una venta por su ID
   * Solo accesible por administradores
   * @param id - ID único de la venta
   * @returns La venta solicitada
   */
  @Get('get/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener venta por ID',
    description: 'Retorna los detalles de una venta específica por su ID. Solo accesible por administradores.',
    operationId: 'getSaleById',
  })
  @ApiParam({
    name: 'id',
    description: 'ID único de la venta',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Venta encontrada exitosamente',
    type: Sale,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado. Se requiere autenticación',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para acceder a este recurso. Se requiere rol de ADMIN.',
  })
  @ApiNotFoundResponse({
    description: 'No se encontró la venta con el ID especificado',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaleResponse> {
    const sale = await this.saleService.findOne(id);
    return { data: sale };
  }

  /**
   * Anula una venta existente
   * @param saleId - ID de la venta a anular
   * @param annulSaleDto - Credenciales de administrador y motivo de la anulación
   * @returns La venta actualizada con estado ANNULLED
   */
  @Patch('annul/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anular una venta',
    description: 'Anula una venta existente. Solo accesible por administradores con credenciales válidas.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la venta a anular',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiBody({
    description: 'Credenciales de administrador y motivo de la anulación',
    type: AnnulSaleDto,
    examples: {
      ejemplo1: {
        summary: 'Anulación de venta',
        value: {
          username: 'admin',
          password: 'contraseñaAdmin123',
          reason: 'Cliente solicitó la cancelación',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Venta anulada exitosamente',
    type: Sale,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'La venta ya ha sido anulada anteriormente',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Credenciales de administrador inválidas',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Venta no encontrada',
  })
  async annulSale(
    @Param('id', ParseUUIDPipe) saleId: string,
    @Body() annulSaleDto: AnnulSaleDto,
  ): Promise<SaleResponse> {
    const { identifier, password, reason } = annulSaleDto;
    const sale = await this.saleService.annulSale(saleId, identifier, password, reason);
    return { data: sale };
  }
}
