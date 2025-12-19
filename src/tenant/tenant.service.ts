import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import * as bcrypt from 'bcrypt';
import { Role, TenantFeature, TenantPlan, TenantStatus, UserStatus } from '@prisma/client';
import { ALL_PERMISSIONS } from '../auth/permissions';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createTenantDto: CreateTenantDto) {
    const {
      name,
      ruc,
      status,
      plan,
      features,
      adminEmail,
      adminPassword,
      adminName,
      adminUsername,
      adminPhone,
      storeName,
      storeAddress,
      storePhone,
    } = createTenantDto;

    this.logger.log(`Iniciando creación de tenant: ${name}`);

    if (ruc) {
      const existingByRuc = await this.prisma.tenant.findFirst({ where: { ruc } });
      if (existingByRuc) {
        throw new ConflictException('Ya existe un tenant con ese RUC');
      }
    }

    const existingAdmin = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: adminEmail }, { username: adminUsername }],
      },
      select: { id: true },
    });

    if (existingAdmin) {
      throw new ConflictException('Ya existe un usuario con ese email o username');
    }

    try {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      const allFeatures = Object.values(TenantFeature) as TenantFeature[];

      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name,
            ruc: ruc || null,
            status: status || TenantStatus.ACTIVE,
            plan: plan || TenantPlan.FREE,
            features: { set: allFeatures },
          },
        });

        const adminUser = await tx.user.create({
          data: {
            email: adminEmail,
            password: hashedPassword,
            name: adminName,
            username: adminUsername,
            phone: adminPhone || 'sin_telefono',
            role: Role.ADMIN,
            status: UserStatus.ACTIVE,
            verified: true,
            permissions: ALL_PERMISSIONS,
            tenantId: tenant.id,
          },
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            role: true,
            status: true,
            verified: true,
            permissions: true,
            tenantId: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        const store = await tx.store.create({
          data: {
            name: storeName || 'Tienda Principal',
            address: storeAddress || null,
            phone: storePhone || null,
            createdById: adminUser.id,
            tenantId: tenant.id,
          },
        });

        await tx.storeUsers.create({
          data: {
            storeId: store.id,
            userId: adminUser.id,
          },
        });

        const allProducts = await tx.product.findMany({
          select: { id: true, basePrice: true },
        });

        if (allProducts.length > 0) {
          await tx.storeProduct.createMany({
            data: allProducts.map((p) => ({
              productId: p.id,
              storeId: store.id,
              stock: 0,
              price: p.basePrice || 0,
              userId: adminUser.id,
              stockThreshold: 1,
            })),
          });
        }

        return { tenant, adminUser, store };
      });

      this.logger.log(`Tenant creado exitosamente: ${result.tenant.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al crear tenant: ${error.message}`, error.stack);
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al crear el tenant');
    }
  }
}
