import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import * as bcrypt from 'bcrypt';
import { Role, TenantFeature, TenantPlan, TenantStatus, UserStatus } from '@prisma/client';
import { ALL_PERMISSIONS } from '../auth/permissions';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';
import type { Express } from 'express';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseStorage: SupabaseStorageService,
  ) {}

  async create(createTenantDto: CreateTenantDto, logo?: Express.Multer.File) {
    const {
      name,
      ruc,
      status,
      currency,
      plan,
      features,
      defaultService,
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

      const defaultFeatures: TenantFeature[] = [
        TenantFeature.DASHBOARD,
        TenantFeature.STORE,
        TenantFeature.CASH,
        TenantFeature.SALES,
        TenantFeature.PDFISSUANCE,
        TenantFeature.SALESOFPRODUCTS,
        TenantFeature.SALESOFSERVICES,
        TenantFeature.SERVICES,
        TenantFeature.IMAGEUPLOAD,
        TenantFeature.PRODUCTS,
        TenantFeature.INVENTORY,
        TenantFeature.CLIENTS,
        TenantFeature.CONFIG,
      ];

      const requestedOrDefaultFeatures = features ?? defaultFeatures;

      const selectedFeatures = Array.from(new Set(requestedOrDefaultFeatures));

      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: ({
            name,
            ruc: ruc || null,
            status: status || TenantStatus.ACTIVE,
            plan: plan || TenantPlan.FREE,
            currency: currency ?? 'PEN',
            features: { set: selectedFeatures },
            ...(defaultService ? { defaultService } : {}),
          } as any),
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
      if (logo) {
        const folder = `tenants/${result.tenant.id}/images`;
        const upload = await this.supabaseStorage.uploadFile(
          {
            buffer: logo.buffer,
            originalname: logo.originalname,
            mimetype: logo.mimetype,
          },
          folder,
        );

        const updatedTenant = await this.prisma.tenant.update({
          where: { id: result.tenant.id },
          data: { logoUrl: upload.url },
        });

        return { ...result, tenant: updatedTenant };
      }

      return result;
    } catch (error) {
      this.logger.error(`Error al crear tenant: ${error.message}`, error.stack);
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al crear el tenant');
    }
  }

  async getFeatures(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        features: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    return {
      features: tenant.features || [],
    };
  }

  async getDefaultService(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        defaultService: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    return tenant.defaultService;
  }

  async countStores(tenantId: string): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    return this.prisma.store.count({
      where: {
        tenantId,
      },
    });
  }

  async updateLogo(tenantId: string, logo: Express.Multer.File) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, logoUrl: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    const folder = `tenants/${tenantId}/images`;
    const upload = await this.supabaseStorage.uploadFile(
      {
        buffer: logo.buffer,
        originalname: logo.originalname,
        mimetype: logo.mimetype,
      },
      folder,
    );

    if (tenant.logoUrl) {
      await this.supabaseStorage.deleteFiles([tenant.logoUrl]).catch((error) =>
        this.logger.warn(`No se pudo eliminar el logo anterior del tenant ${tenantId}: ${error?.message || error}`),
      );
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl: upload.url },
    });

    return {
      message: 'Logo actualizado exitosamente',
      tenant: updatedTenant,
    };
  }

  async disableTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.DISABLED },
    });

    return {
      message: 'Tenant desactivado exitosamente',
      tenant: updatedTenant,
    };
  }

  async enableTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.ACTIVE },
    });

    return {
      message: 'Tenant activado exitosamente',
      tenant: updatedTenant,
    };
  }
}
