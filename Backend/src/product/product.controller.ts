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
  HttpStatus, 
  HttpCode,
  ParseUUIDPipe,
  Query,
  BadRequestException,
  NotFoundException
} from '@nestjs/common';
import { 
  ApiBearerAuth, 
  ApiOperation, 
  ApiResponse, 
  ApiTags, 
  ApiUnauthorizedResponse,
  ApiBody,
  ApiQuery,
  ApiParam
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { 
  ProductResponseDto, 
  ProductListResponseDto,
  CreatedByDto 
} from './dto/product-response.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Productos')
@Controller('products')
@ApiBearerAuth('JWT')
@ApiUnauthorizedResponse({ description: 'Se requiere autenticación mediante JWT' })
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * Crea un nuevo producto en el sistema
   * @param req - Objeto de solicitud que contiene el token JWT
   * @param createProductDto - Datos del producto a crear
   * @returns El producto creado
   */
  @Post('create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Crear un nuevo producto',
    description: 'Crea un nuevo producto en el sistema. Requiere autenticación JWT.'
  })
  @ApiBody({ 
    type: CreateProductDto,
    description: 'Datos del producto a crear',
    examples: {
      ejemplo1: {
        summary: 'Producto básico',
        value: {
          name: 'Laptop HP ProBook',
          description: 'Laptop de 14 pulgadas con 8GB RAM y 256GB SSD',
          price: 1200.99,
          stock: 15
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Producto creado exitosamente',
    type: ProductResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Datos de entrada inválidos'
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'No autorizado. Se requiere autenticación'
  })
  async create(
    @Request() req: any,
    @Body() createProductDto: CreateProductDto
  ): Promise<{ data: ProductResponseDto }> {
    const userId = req.user.userId;
    const product = await this.productService.create(createProductDto, userId);
    const productWithUser = await this.productService.findOne(product.id);
    
    if (!productWithUser) {
      throw new NotFoundException('No se pudo recuperar el producto creado');
    }

    const productDto: ProductResponseDto = {
      id: productWithUser.id,
      name: productWithUser.name,
      description: productWithUser.description,
      price: productWithUser.price,
      stock: productWithUser.stock,
      createdAt: productWithUser.createdAt,
      updatedAt: productWithUser.updatedAt,
      createdById: productWithUser.createdById,
      createdBy: productWithUser.createdBy ? {
        id: productWithUser.createdBy.id,
        name: productWithUser.createdBy.name || null,
        email: productWithUser.createdBy.email
      } : undefined
    };

    return { data: productDto };
  }

  /**
   * Obtiene todos los productos con soporte para paginación y búsqueda
   * @param paginationDto - Parámetros de paginación y búsqueda
   * @returns Lista paginada de productos y total de registros
   */
  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener todos los productos',
    description: 'Retorna una lista paginada de todos los productos disponibles en el sistema. Accesible para usuarios autenticados con rol ADMIN o USER.'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number, 
    description: 'Número de página (por defecto: 1)' 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'No autorizado. Se requiere autenticación'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para acceder a este recurso. Se requiere rol de ADMIN o USER.'
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number, 
    description: 'Cantidad de registros por página (por defecto: 10, máximo: 100)' 
  })
  @ApiQuery({ 
    name: 'search', 
    required: false, 
    type: String, 
    description: 'Término de búsqueda para filtrar productos por nombre o descripción' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de productos obtenida exitosamente',
    type: ProductListResponseDto
  })
  async findAll(
    @Query() paginationDto: PaginationDto
  ): Promise<ProductListResponseDto> {
    const [products, total] = await Promise.all([
      this.productService.findAll(paginationDto),
      this.productService.count()
    ]);
    
    // Mapear los productos al tipo ProductResponseDto
    const productDtos: ProductResponseDto[] = products.map(product => {
      const productData = product as any; // Usamos 'any' temporalmente para acceder a las propiedades
      const dto: ProductResponseDto = {
        id: productData.id,
        name: productData.name,
        description: productData.description,
        price: productData.price,
        stock: productData.stock,
        createdAt: productData.createdAt,
        updatedAt: productData.updatedAt,
        createdById: productData.createdById
      };

      // Solo agregar createdBy si existe
      if (productData.createdBy) {
        dto.createdBy = {
          id: productData.createdBy.id,
          name: productData.createdBy.name || null,
          email: productData.createdBy.email
        };
      }

      return dto;
    });
    
    return { data: productDtos, total };
  }

  /**
   * Obtiene los productos creados por un usuario específico
   * @param userId - ID del usuario cuyos productos se desean consultar
   * @param paginationDto - Parámetros de paginación y búsqueda
   * @returns Lista paginada de productos del usuario y total de registros
   */
  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ 
    summary: 'Obtener productos creados por ID de usuario',
    description: 'Retorna los productos creados por un usuario específico. Solo accesible para administradores.'
  })
  @ApiBearerAuth('JWT')
  @ApiParam({
    name: 'userId',
    description: 'ID del usuario cuyos productos se desean consultar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tiene permisos para acceder a este recurso. Se requiere rol de ADMIN.'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number, 
    description: 'Número de página (por defecto: 1)' 
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number, 
    description: 'Cantidad de registros por página (por defecto: 10, máximo: 100)' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de productos del usuario obtenida exitosamente',
    type: ProductListResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'No autorizado. Se requiere autenticación'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No se encontró el usuario con el ID especificado',
  })
  async findUserProducts(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() paginationDto: PaginationDto
  ): Promise<ProductListResponseDto> {
    const [products, total] = await Promise.all([
      this.productService.findByUserId(userId, paginationDto),
      this.productService.count({ createdById: userId })
    ]);
    
    // Mapear los productos al tipo ProductResponseDto
    const productDtos: ProductResponseDto[] = products.map(product => {
      const productData = product as any;
      const dto: ProductResponseDto = {
        id: productData.id,
        name: productData.name,
        description: productData.description,
        price: productData.price,
        stock: productData.stock,
        createdAt: productData.createdAt,
        updatedAt: productData.updatedAt,
        createdById: productData.createdById
      };

      // Solo agregar createdBy si existe
      if (productData.createdBy) {
        dto.createdBy = {
          id: productData.createdBy.id,
          name: productData.createdBy.name || null,
          email: productData.createdBy.email
        };
      }

      return dto;
    });
    
    return { data: productDtos, total };
  }

  /**
   * Obtiene un producto por su ID
   * @param id - ID único del producto
   * @returns El producto solicitado
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener producto por ID',
    description: 'Retorna los detalles de un producto específico por su ID. Accesible para usuarios autenticados con rol ADMIN o USER.'
  })
  @ApiBearerAuth('JWT')
  @ApiParam({
    name: 'id',
    description: 'ID único del producto a consultar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado. Se requiere autenticación',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para acceder a este recurso. Se requiere rol de ADMIN o USER.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No se encontró el producto con el ID especificado',
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Producto encontrado exitosamente',
    type: ProductResponseDto
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<{ data: ProductResponseDto }> {
    const product = await this.productService.findOne(id);
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    
    const productData = product as any; // Usamos 'any' temporalmente para acceder a las propiedades
    const productDto: ProductResponseDto = {
      id: productData.id,
      name: productData.name,
      description: productData.description,
      price: productData.price,
      stock: productData.stock,
      createdAt: productData.createdAt,
      updatedAt: productData.updatedAt,
      createdById: productData.createdById
    };

    // Solo agregar createdBy si existe
    if (productData.createdBy) {
      productDto.createdBy = {
        id: productData.createdBy.id,
        name: productData.createdBy.name || null,
        email: productData.createdBy.email
      };
    }
    
    return { data: productDto };
  }

  /**
   * Actualiza un producto existente
   * @param id - ID del producto a actualizar
   * @param updateProductDto - Datos a actualizar del producto
   * @param req - Objeto de solicitud que contiene el token JWT
   * @returns El producto actualizado
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ 
    summary: 'Actualizar un producto',
    description: 'Actualiza los datos de un producto existente. Solo el propietario puede actualizar el producto.'
  })
  @ApiParam({
    name: 'id',
    description: 'ID único del producto a actualizar',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiBody({ 
    type: UpdateProductDto,
    description: 'Datos del producto a actualizar',
    examples: {
      ejemplo1: {
        summary: 'Actualizar precio y stock',
        value: {
          price: 1299.99,
          stock: 20
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Producto actualizado exitosamente',
    type: ProductResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró el producto con el ID especificado'
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tienes permiso para actualizar este producto'
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'No autorizado. Se requiere autenticación'
  })
  async update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateProductDto: UpdateProductDto
  ): Promise<{ data: ProductResponseDto }> {
    const userId = req.user.userId;
    await this.productService.update(id, updateProductDto, userId);
    const updatedProduct = await this.productService.findOne(id);
    
    if (!updatedProduct) {
      throw new NotFoundException(`No se pudo recuperar el producto actualizado con ID "${id}"`);
    }
    
    const productData = updatedProduct as any; // Usamos 'any' temporalmente para acceder a las propiedades
    const productDto: ProductResponseDto = {
      id: productData.id,
      name: productData.name,
      description: productData.description,
      price: productData.price,
      stock: productData.stock,
      createdAt: productData.createdAt,
      updatedAt: productData.updatedAt,
      createdById: productData.createdById
    };

    // Solo agregar createdBy si existe
    if (productData.createdBy) {
      productDto.createdBy = {
        id: productData.createdBy.id,
        name: productData.createdBy.name || null,
        email: productData.createdBy.email
      };
    }
    
    return { data: productDto };
  }

  /**
   * Elimina un producto
   * @param id - ID del producto a eliminar
   * @param req - Objeto de solicitud que contiene el token JWT
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Eliminar un producto',
    description: 'Elimina un producto del sistema. Solo el propietario puede eliminar el producto.'
  })
  @ApiParam({
    name: 'id',
    description: 'ID único del producto a eliminar',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Producto eliminado exitosamente' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró el producto con el ID especificado'
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tienes permiso para eliminar este producto'
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'No autorizado. Se requiere autenticación'
  })
  async remove(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    const userId = req.user.userId;
    await this.productService.remove(id, userId);
  }
}
