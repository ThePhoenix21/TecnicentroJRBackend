import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpStatus,
  HttpCode,
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
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

@ApiTags('Productos')
@ApiBearerAuth('JWT')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'No autorizado' })
@ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No tiene permisos' })
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('create')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Crear un nuevo producto' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'El producto ha sido creado exitosamente',
    type: Product,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos',
  })
  async create(
    @Req() req: any,
    @Body() createProductDto: CreateProductDto,
  ): Promise<Product> {
    console.log('Usuario en la solicitud:', req.user);
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      console.error('No se pudo obtener el ID del usuario. Objeto user completo:', req.user);
      throw new Error('No se pudo obtener el ID del usuario del token JWT');
    }
    
    console.log('ID de usuario que se usará:', userId);
    return this.productService.create(userId, createProductDto);
  }

  @Get('my-products')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener los productos del usuario autenticado' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de productos del usuario obtenida exitosamente',
    type: [Product],
  })
  async findMyProducts(@Req() req: any): Promise<Product[]> {
    return this.productService.findAll(req.user.userId);
  }

  @Get('all')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener todos los productos disponibles' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de todos los productos obtenida exitosamente',
    type: [Product],
  })
  async findAllProducts(): Promise<Product[]> {
    return this.productService.findAllProducts();
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener un producto por ID' })
  @ApiParam({ name: 'id', description: 'ID del producto', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Producto encontrado',
    type: Product,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Producto no encontrado',
  })
  async findOne(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Product> {
    return this.productService.findOne(req.user.userId, id);
  }

  @Patch('update/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar un producto' })
  @ApiParam({ name: 'id', description: 'ID del producto a actualizar', format: 'uuid' })
  @ApiBody({ type: UpdateProductDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Producto actualizado exitosamente',
    type: Product,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Producto no encontrado',
  })
  async update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    // Como este endpoint solo es accesible para administradores,
    // pasamos isAdmin=true para permitir la actualización de cualquier producto
    return this.productService.update(req.user.userId, id, updateProductDto, true);
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminación lógica de un producto' })
  @ApiParam({ name: 'id', description: 'ID del producto a marcar como eliminado', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Producto marcado como eliminado exitosamente',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Producto no encontrado',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tienes permiso para realizar esta acción',
  })
  async remove(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    // Pasamos isAdmin=true ya que el decorador @Roles(Role.ADMIN) ya validó que es administrador
    return this.productService.remove(req.user.userId, id, true);
  }
}
