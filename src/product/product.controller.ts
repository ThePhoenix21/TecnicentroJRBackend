import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseUUIDPipe,
  ForbiddenException,
  HttpStatus,
  HttpCode,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

@ApiTags('Productos')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Crear un nuevo producto' })
  @ApiCreatedResponse({ 
    description: 'El producto ha sido creado exitosamente.',
    type: Product,
  })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiUnauthorizedResponse({ description: 'No autorizado. Se requiere autenticación.' })
  @ApiForbiddenResponse({ description: 'No tiene permisos para realizar esta acción.' })
  @ApiBody({ type: CreateProductDto })
  async create(@Request() req, @Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto, req.user.userId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener todos los productos',
    description: 'Los usuarios solo ven sus productos, los administradores ven todos.'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número de página',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados por página',
    example: 10,
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'Filtrar por ID de usuario (solo administradores)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Lista de productos obtenida exitosamente.',
    type: [Product],
  })
  @ApiUnauthorizedResponse({ description: 'No autorizado. Se requiere autenticación.' })
  @ApiForbiddenResponse({ description: 'No tiene permisos para ver estos recursos.' })
  async findAll(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('userId') userId?: string,
  ) {
    // Solo los administradores pueden filtrar por userId
    if (userId && req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('No tiene permisos para filtrar por usuario');
    }
    
    return this.productService.findAll({
      page: Number(page),
      limit: Number(limit),
      userId: req.user.role === Role.ADMIN ? userId || undefined : req.user.userId,
    });
  }

  @Get('user/:userId')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Obtener productos por usuario',
    description: 'Obtiene los productos de un usuario específico. Los usuarios solo pueden ver sus propios productos.'
  })
  @ApiParam({
    name: 'userId',
    required: true,
    description: 'ID del usuario',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número de página',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite de resultados por página',
    example: 10,
  })
  @ApiOkResponse({
    description: 'Lista de productos del usuario obtenida exitosamente.',
    type: [Product],
  })
  @ApiUnauthorizedResponse({ description: 'No autorizado. Se requiere autenticación.' })
  @ApiForbiddenResponse({ description: 'No tiene permisos para ver estos recursos.' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  async findByUser(
    @Request() req,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    // Solo los administradores pueden ver productos de otros usuarios
    if (req.user.role !== Role.ADMIN && req.user.userId !== userId) {
      throw new ForbiddenException('Solo puede ver sus propios productos');
    }

    return this.productService.findByUser(userId, {
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener un producto por ID',
    description: 'Obtiene un producto por su ID. Los usuarios solo pueden ver sus propios productos.'
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'ID del producto',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Producto encontrado exitosamente.',
    type: Product,
  })
  @ApiNotFoundResponse({ description: 'Producto no encontrado.' })
  @ApiUnauthorizedResponse({ description: 'No autorizado. Se requiere autenticación.' })
  @ApiForbiddenResponse({ description: 'No tiene permisos para ver este recurso.' })
  async findOne(@Request() req, @Param('id', new ParseUUIDPipe()) id: string) {
    const product = await this.productService.findOne(id);
    
    // Solo el propietario o un administrador pueden ver el producto
    if (req.user.role !== Role.ADMIN && product.userId !== req.user.userId) {
      throw new ForbiddenException('No tiene permisos para ver este producto');
    }
    
    return product;
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.USER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Actualizar un producto',
    description: 'Actualiza un producto existente. Los usuarios solo pueden actualizar sus propios productos.'
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'ID del producto a actualizar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiBody({ type: UpdateProductDto })
  @ApiOkResponse({
    description: 'El producto ha sido actualizado exitosamente.',
    type: Product,
  })
  @ApiNotFoundResponse({ description: 'Producto no encontrado.' })
  @ApiUnauthorizedResponse({ description: 'No autorizado. Se requiere autenticación.' })
  @ApiForbiddenResponse({ description: 'No tiene permisos para actualizar este producto.' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  async update(
    @Request() req,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    const product = await this.productService.findOne(id);
    
    // Solo el propietario o un administrador pueden actualizar el producto
    if (req.user.role !== Role.ADMIN && product.userId !== req.user.userId) {
      throw new ForbiddenException('Solo puede actualizar sus propios productos');
    }
    
    return this.productService.update(id, updateProductDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.USER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Eliminar un producto',
    description: 'Elimina un producto existente. Los usuarios solo pueden eliminar sus propios productos.'
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'ID del producto a eliminar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'El producto ha sido eliminado exitosamente.',
  })
  @ApiNotFoundResponse({ description: 'Producto no encontrado.' })
  @ApiUnauthorizedResponse({ description: 'No autorizado. Se requiere autenticación.' })
  @ApiForbiddenResponse({ description: 'No tiene permisos para eliminar este producto.' })
  async remove(@Request() req, @Param('id', new ParseUUIDPipe()) id: string) {
    const product = await this.productService.findOne(id);
    
    // Solo el propietario o un administrador pueden eliminar el producto
    if (req.user.role !== Role.ADMIN && product.userId !== req.user.userId) {
      throw new ForbiddenException('Solo puede eliminar sus propios productos');
    }
    
    return this.productService.remove(id);
  }
}
