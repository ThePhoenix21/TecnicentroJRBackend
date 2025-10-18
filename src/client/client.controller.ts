import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  ParseUUIDPipe, 
  HttpStatus,
  Query,
  UseGuards,
  Request,
  ForbiddenException
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBody, 
  ApiParam,
  ApiQuery,
  ApiBearerAuth
} from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';

@ApiTags('clientes')
@ApiBearerAuth()
@Controller('clientes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo cliente', description: 'Crea un nuevo registro de cliente en el sistema' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'El cliente ha sido creado exitosamente' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'El cliente ya existe (email, RUC o DNI duplicado)' })
  @ApiBody({ type: CreateClientDto })
  @Roles(Role.ADMIN, Role.USER) // Público también puede crear (sin autenticación)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async create(@Body() createClientDto: CreateClientDto): Promise<Client> {
    // Si no está autenticado, se permite el registro
    return this.clientService.create(createClientDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Obtener todos los clientes', description: 'Obtiene una lista paginada de todos los clientes. Solo para ADMIN' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página (por defecto: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite de resultados por página (por defecto: 10)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de clientes obtenida exitosamente' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No autorizado' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.clientService.findAll({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Obtener un cliente por ID', description: 'Obtiene los detalles de un cliente específico. Los usuarios solo pueden ver su propio perfil' })
  @ApiParam({ name: 'id', description: 'ID único del cliente (UUID)', type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Cliente encontrado' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Cliente no encontrado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No autorizado' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any
  ): Promise<Client> {
    const client = await this.clientService.findOne(id);
    
    // Si no es ADMIN y no es el dueño del perfil, denegar acceso
    if (req.user.role !== 'ADMIN' && req.user.userId !== client.userId) {
      throw new ForbiddenException('No tienes permiso para ver este perfil');
    }
    
    return client;
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.USER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Actualizar un cliente', description: 'Actualiza los datos de un cliente existente. Los usuarios solo pueden actualizar su propio perfil' })
  @ApiParam({ name: 'id', description: 'ID único del cliente (UUID)', type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Cliente actualizado exitosamente' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Cliente no encontrado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No autorizado' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Conflicto con datos únicos (email, RUC o DNI duplicado)' })
  @ApiBody({ type: UpdateClientDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateClientDto: UpdateClientDto,
    @Request() req: any
  ): Promise<Client> {
    // Si no es ADMIN, verificar que esté actualizando su propio perfil
    if (req.user.role !== 'ADMIN') {
      const client = await this.clientService.findOne(id);
      if (client.userId !== req.user.userId) {
        throw new ForbiddenException('Solo puedes actualizar tu propio perfil');
      }
    }
    
    return this.clientService.update(id, updateClientDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Eliminar un cliente', description: 'Elimina un cliente del sistema. Solo para ADMIN' })
  @ApiParam({ name: 'id', description: 'ID único del cliente (UUID)', type: String })
  @ApiResponse({ status: HttpStatus.OK, description: 'Cliente eliminado exitosamente' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Cliente no encontrado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No autorizado' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any
  ): Promise<void> {
    return this.clientService.remove(id);
  }

  @Get('search')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Buscar clientes', description: 'Busca clientes por nombre, email o teléfono. Solo para ADMIN' })
  @ApiQuery({ name: 'query', required: true, description: 'Término de búsqueda' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Resultados de la búsqueda' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No autorizado' })
  async search(@Query('query') query: string) {
    return this.clientService.search(query);
  }
}
