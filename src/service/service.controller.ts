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
  BadRequestException,
  ForbiddenException,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ServiceService } from './service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './entities/service.entity';
import { ListServicesDto } from './dto/list-services.dto';
import { ListServicesResponseDto } from './dto/list-services-response.dto';
import { ListServicesWithClientsDto } from './dto/list-services-with-clients.dto';
import { ServiceLookupItemDto } from './dto/service-lookup-item.dto';
import { ServiceDetailResponseDto } from './dto/service-detail-response.dto';
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
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';

@RequireTenantFeatures(TenantFeature.SERVICES)
@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ServiceController {
  constructor(
    private readonly serviceService: ServiceService,
    private readonly supabaseStorage: SupabaseStorageService
  ) {}

  private hasPermission(user: any, permission: string): boolean {
    if (!user?.permissions) return false;
    return user.permissions.includes(permission);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  @ApiOperation({ summary: 'Listado paginado de servicios' })
  async list(
    @Req() req: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: ListServicesDto,
  ): Promise<ListServicesResponseDto> {
    return this.serviceService.list(query, req.user);
  }

  @Get('lookup')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  @ApiOperation({ summary: 'Lookup de servicios (id y value)' })
  async lookup(@Req() req: any): Promise<ServiceLookupItemDto[]> {
    return this.serviceService.lookup(req.user);
  }

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
  @ApiOperation({ summary: 'Crear un nuevo servicio' })
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async create(
    @Body() createServiceDto: CreateServiceDto,
    @Req() req: any,
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

      return this.serviceService.create(createServiceDto, req.user);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('findAll')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener lista de servicios' })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async findAll(
    @Req() req: any,
    @Query('status') status?: ServiceStatus,
    @Query('type') type?: ServiceType,
    @Query('storeId') storeId?: string,
  ): Promise<Service[]> {
    return this.serviceService.findAll(status, type, storeId, req.user);
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener servicio por ID' })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES, PERMISSIONS.DETAIL_SERVICES)
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<Service> {
    return this.serviceService.findOne(id, req.user);
  }

  @Patch('update/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Actualizar un servicio' })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateServiceDto: UpdateServiceDto,
    @Req() req: any
  ): Promise<Service> {
    return this.serviceService.update(id, updateServiceDto, req.user);
  }

  @Patch('status/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Cambiar estado de un servicio' })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateStatusDto: { status: 'IN_PROGRESS' | 'COMPLETED' | 'DELIVERED' | 'PAID' | 'ANNULLATED' },
    @Req() req: any
  ): Promise<Service> {
    return this.serviceService.update(id, { status: updateStatusDto.status }, req.user);
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un servicio' })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<void> {
    return this.serviceService.remove(id, req.user);
  }

  @Get(':id/pending-payment')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener monto pendiente de pago de un servicio' })
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES)
  async getPendingPayment(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.serviceService.getPendingPayment(id, req.user);
  }

  @Get('findAllWithClients')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener servicios con información de clientes' })
  async findAllWithClients(
    @Req() req: any,
    @Query() query: ListServicesWithClientsDto,
  ): Promise<ListServicesResponseDto> {
    const user = req.user;
    if (user?.role !== Role.ADMIN) {
      const hasViewOwn = this.hasPermission(user, PERMISSIONS.VIEW_SERVICES);
      const hasViewAll = this.hasPermission(user, PERMISSIONS.VIEW_ALL_SERVICES);

      if (!hasViewOwn && !hasViewAll) {
        throw new ForbiddenException('No tienes permisos para ver servicios');
      }
    }

    return this.serviceService.findAllWithClients(query, req.user);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SERVICES, PERMISSIONS.DETAIL_SERVICES)
  @ApiOperation({ summary: 'Detalle completo de servicio' })
  async getDetail(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<ServiceDetailResponseDto> {
    return this.serviceService.getDetail(id, req.user);
  }
}
