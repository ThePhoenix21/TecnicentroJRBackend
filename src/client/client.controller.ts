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
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
  BadRequestException
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBearerAuth
} from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from '@prisma/client';
import { ListClientsDto } from './dto/list-clients.dto';
import { ListClientsResponseDto } from './dto/list-clients-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { PERMISSIONS } from '../auth/permissions';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';

@ApiTags('clientes')
@ApiBearerAuth()
@RequireTenantFeatures(TenantFeature.CLIENTS)
@Controller('clientes')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  private getAuthenticatedUserId(req: any): string | undefined {
    return req.user?.userId ?? req.user?.sub;
  }

  private hasPermission(req: any, permission: string): boolean {
    return Array.isArray(req.user?.permissions) && req.user.permissions.includes(permission);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo cliente' })
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS)
  @Roles(Role.ADMIN, Role.USER) // Público también puede crear (sin autenticación)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async create(@Body() createClientDto: CreateClientDto, @Request() req: any): Promise<Client> {
    // Si no está autenticado, se permite el registro
    const tenantId = req.user?.tenantId;
    return this.clientService.create(createClientDto, tenantId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Obtener clientes (paginado y filtrable)' })
  async findAll(@Query() query: ListClientsDto, @Request() req: any): Promise<ListClientsResponseDto> {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.clientService.list(query, tenantId);
  }

  @Get('lookup-name')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS, PERMISSIONS.VIEW_SERVICES, PERMISSIONS.VIEW_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Lookup de nombres de clientes (id, name)' })
  async lookupName(@Request() req: any) {
    const tenantId = req.user?.tenantId;
    return this.clientService.lookupName(tenantId);
  }

  @Get('lookup-phone')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Lookup de teléfonos de clientes (id, phone)' })
  async lookupPhone(@Request() req: any) {
    const tenantId = req.user?.tenantId;
    return this.clientService.lookupPhone(tenantId);
  }

  @Get('lookup-dni')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Lookup de DNI de clientes (id, dni)' })
  async lookupDni(@Request() req: any) {
    const tenantId = req.user?.tenantId;
    return this.clientService.lookupDni(tenantId);
  }

  @Get(':id/full')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS, PERMISSIONS.MANAGE_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Obtener cliente completo (con relaciones)' })
  async getFull(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ) {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const client = await this.clientService.getFull(id, tenantId);
    const requesterUserId = this.getAuthenticatedUserId(req);
    const canManageClients = this.hasPermission(req, PERMISSIONS.MANAGE_CLIENTS);

    if (req.user.role !== 'ADMIN' && !canManageClients && requesterUserId !== (client as any).userId) {
      throw new ForbiddenException('No tienes permiso para ver este perfil');
    }

    const { userId, ...safeClient } = client as any;
    return safeClient;
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS, PERMISSIONS.MANAGE_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Obtener un cliente por ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any
  ): Promise<Client> {
    const tenantId = req.user?.tenantId;
    const client = await this.clientService.findOne(id, tenantId);
    const requesterUserId = this.getAuthenticatedUserId(req);
    
    // Si no es ADMIN y no es el dueño del perfil, denegar acceso
    if (req.user.role !== 'ADMIN' && requesterUserId !== client.userId) {
      throw new ForbiddenException('No tienes permiso para ver este perfil');
    }
    
    return client;
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Actualizar un cliente' })
  async update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateClientDto: UpdateClientDto,
    @Request() req: any
  ): Promise<Client> {
    // Si no es ADMIN, verificar que esté actualizando su propio perfil
    if (req.user.role !== 'ADMIN') {
      const tenantId = req.user?.tenantId;
      const client = await this.clientService.findOne(id, tenantId);
      const requesterUserId = this.getAuthenticatedUserId(req);
      if (client.userId !== requesterUserId) {
        throw new ForbiddenException('Solo puedes actualizar tu propio perfil');
      }
    }
    
    const tenantId = req.user?.tenantId;
    return this.clientService.update(id, updateClientDto, tenantId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS, PERMISSIONS.MANAGE_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Eliminar un cliente' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any
  ): Promise<void> {
    throw new BadRequestException('Hard delete deshabilitado. Use el endpoint de soft delete.');
  }

  @Patch(':id/soft-delete')
  @Roles(Role.ADMIN,Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS, PERMISSIONS.MANAGE_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Soft delete de cliente' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ) {
    const tenantId = req.user?.tenantId;
    return this.clientService.softDelete(id, tenantId);
  }

  @Get('search')
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Buscar clientes' })
  async search(@Query('query') query: string, @Request() req: any) {
    const tenantId = req.user?.tenantId;
    return this.clientService.search(query, tenantId);
  }

  @Get('dni/:dni')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_CLIENTS, PERMISSIONS.MANAGE_CLIENTS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Obtener cliente por DNI' })
  async findByDni(
    @Param('dni') dni: string,
    @Request() req: any
  ): Promise<Client | Record<string, any>> {
    // Validar formato del DNI (debe ser un número de 8 dígitos)
    const dniRegex = /^\d{8}$/;
    if (!dniRegex.test(dni)) {
      throw new BadRequestException('El DNI debe ser un número de 8 dígitos');
    }

    // Buscar cliente por DNI
    const tenantId = req.user?.tenantId;
    const client = await this.clientService.findByDni(dni, tenantId);
    
    if (!client) {
      throw new NotFoundException(`No se encontró cliente con DNI ${dni}`);
    }

    if ((client as any).source === 'RENIEC') {
      return {
        id: null,
        name: (client as any).name,
        email: null,
        phone: null,
        address: null,
        ruc: null,
        dni: (client as any).dni,
        createdAt: null,
        updatedAt: null,
        deletedAt: null,
        userId: null,
        tenantId: req.user?.tenantId ?? null,
        source: 'RENIEC',
      };
    }

    // ✅ AMBOS ROLES (ADMIN y USER) pueden ver cualquier cliente
    return client;
  }
}
