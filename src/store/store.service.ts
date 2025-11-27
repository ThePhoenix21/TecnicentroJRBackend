import { Injectable, Logger, UnauthorizedException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

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
          name: createStoreDto.name
        }
      });

      if (existingStore) {
        this.logger.warn(`Ya existe una tienda con el nombre: ${createStoreDto.name}`);
        throw new ConflictException('Ya existe una tienda con ese nombre');
      }

      // Crear la tienda
      const newStore = await this.prisma.store.create({
        data: {
          name: createStoreDto.name,
          address: createStoreDto.address,
          phone: createStoreDto.phone,
          createdById: adminUser.id
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
      const adminUsers = await this.prisma.user.findMany({
        where: { role: 'ADMIN' }
      });

      if (adminUsers.length > 0) {
        const storeUsersData = adminUsers.map(admin => ({
          storeId: newStore.id,
          userId: admin.id,
        }));

        await this.prisma.storeUsers.createMany({
          data: storeUsersData,
        });

        this.logger.log(`Se crearon ${storeUsersData.length} registros StoreUsers para la nueva tienda ${newStore.name}`);
      }

      this.logger.log(`Tienda creada exitosamente: ${newStore.id} - ${newStore.name} por admin: ${adminUser.email}`);

      return {
        message: 'Tienda creada exitosamente',
        store: newStore
      };

    } catch (error) {
      this.logger.error(`Error al crear tienda: ${error.message}`, error.stack);
      
      if (error instanceof UnauthorizedException || error instanceof ConflictException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Error al crear la tienda');
    }
  }

  findAll() {
    return this.prisma.store.findMany({
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  findOne(id: string) {
    return this.prisma.store.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  update(id: string, updateStoreDto: UpdateStoreDto) {
    return this.prisma.store.update({
      where: { id },
      data: updateStoreDto,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  remove(id: string) {
    return this.prisma.store.delete({
      where: { id }
    });
  }
}
