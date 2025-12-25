import { ForbiddenException, Injectable, Logger, UnauthorizedException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  private getTenantIdOrThrow(user: AuthUser): string {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }
    return tenantId;
  }

  private async attachCreatedByForTenant(store: any, tenantId: string) {
    if (!store?.createdById) {
      return { ...store, createdBy: null };
    }

    const createdBy = await this.prisma.user.findFirst({
      where: {
        id: store.createdById,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return { ...store, createdBy: createdBy ?? null };
  }

  async create(createStoreDto: CreateStoreDto) {
    this.logger.log(`Iniciando creación de store: ${createStoreDto.name}`);

    try {
      // Validar credenciales del administrador
      this.logger.debug(`Validando credenciales del administrador: ${createStoreDto.adminEmail}`);
      const adminUser = await this.authService.validateAnyUser(
        createStoreDto.adminEmail,
        createStoreDto.adminPassword
      );

      // Verificar que el usuario tenga rol ADMIN
      if (adminUser.role !== 'ADMIN') {
        this.logger.warn(`Usuario ${adminUser.email} intentó crear store sin rol ADMIN. Rol actual: ${adminUser.role}`);
        throw new UnauthorizedException('Solo los administradores pueden crear tiendas');
      }

      // Verificar si ya existe una tienda con el mismo nombre
      const existingStore = await this.prisma.store.findFirst({
        where: {
          name: createStoreDto.name,
          tenantId: adminUser.tenantId
        }
      });

      if (existingStore) {
        this.logger.warn(`Ya existe una tienda con el nombre: ${createStoreDto.name}`);
        throw new ConflictException('Ya existe una tienda con ese nombre');
      }

      // Usar transacción para asegurar que se crea todo o nada
      const result = await this.prisma.$transaction(async (prisma) => {
        // Crear la tienda
        const newStore = await prisma.store.create({
          data: {
            name: createStoreDto.name,
            address: createStoreDto.address,
            phone: createStoreDto.phone,
            createdById: adminUser.id,
            tenantId: adminUser.tenantId
          },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true
              }
            }
          }
        });

        // Obtener todos los usuarios administradores y crear registros en StoreUsers
        const adminUsers = await prisma.user.findMany({
          where: { role: 'ADMIN', tenantId: adminUser.tenantId }
        });

        if (adminUsers.length > 0) {
          const storeUsersData = adminUsers.map(admin => ({
            storeId: newStore.id,
            userId: admin.id,
          }));

          await prisma.storeUsers.createMany({
            data: storeUsersData,
          });

          this.logger.log(`Se crearon ${storeUsersData.length} registros StoreUsers para la nueva tienda ${newStore.name}`);
        }

        // Crear StoreProducts para todos los productos existentes
        const allProducts = await prisma.product.findMany();
        if (allProducts.length > 0) {
          const storeProductsData = allProducts.map(product => ({
            productId: product.id,
            storeId: newStore.id,
            stock: 0,
            price: product.basePrice || 0,
            userId: adminUser.id,
            stockThreshold: 1 // Valor por defecto
          }));
          
          await prisma.storeProduct.createMany({
            data: storeProductsData
          });
          
          this.logger.log(`Se crearon ${storeProductsData.length} StoreProducts para la nueva tienda`);
        }

        return newStore;
      });

      this.logger.log(`Tienda creada exitosamente: ${result.id} - ${result.name} por admin: ${adminUser.email}`);

      return {
        message: 'Tienda creada exitosamente',
        store: result
      };

    } catch (error) {
      this.logger.error(`Error al crear tienda: ${error.message}`, error.stack);
      
      if (error instanceof UnauthorizedException || error instanceof ConflictException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Error al crear la tienda');
    }
  }

  findAll(tenantId: string) {
    return this.prisma.store.findMany({
      where: { tenantId },
    }).then((stores) => Promise.all(stores.map((s) => this.attachCreatedByForTenant(s, tenantId))));
  }

  async findOne(id: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId },
    });

    if (!store) {
      return null;
    }

    return this.attachCreatedByForTenant(store, tenantId);
  }

  async update(id: string, updateStoreDto: UpdateStoreDto, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const existing = await this.prisma.store.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) {
      return null;
    }

    const updated = await this.prisma.store.update({
      where: { id },
      data: updateStoreDto,
    });

    return this.attachCreatedByForTenant(updated, tenantId);
  }

  async remove(id: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const existing = await this.prisma.store.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) {
      return null;
    }

    return this.prisma.store.delete({
      where: { id }
    });
  }
}
