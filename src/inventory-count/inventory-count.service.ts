import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryCountSessionDto } from './dto/create-inventory-count-session.dto';
import { AddInventoryCountItemDto } from './dto/add-inventory-count-item.dto';
import { UpdateInventoryCountItemDto } from './dto/update-inventory-count-item.dto';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class InventoryCountService {
  constructor(private prisma: PrismaService) {}

  private async assertStoreAccess(storeId: string, user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!store) {
      throw new NotFoundException('Tienda no encontrada');
    }

    if (!store.tenantId || store.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para acceder a esta tienda');
    }

    if (user.role !== 'ADMIN') {
      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId,
          userId: user.userId,
        },
        select: { id: true },
      });

      if (!storeUser) {
        throw new ForbiddenException('No tienes permisos para acceder a esta tienda');
      }
    }

    return store;
  }

  private async assertSessionAccess(sessionId: string, user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const session = await this.prisma.inventoryCountSession.findUnique({
      where: { id: sessionId },
      include: {
        store: {
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión de conteo no encontrada');
    }

    if (!session.store?.tenantId || session.store.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para acceder a esta sesión de conteo');
    }

    if (user.role !== 'ADMIN') {
      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId: session.storeId,
          userId: user.userId,
        },
        select: { id: true },
      });

      if (!storeUser) {
        throw new ForbiddenException('No tienes permisos para acceder a esta sesión de conteo');
      }
    }

    return session;
  }

  async createSession(createDto: CreateInventoryCountSessionDto, user: AuthUser) {
    const { storeId, name } = createDto;

    await this.assertStoreAccess(storeId, user);

    // Crear la sesión
    return this.prisma.inventoryCountSession.create({
      data: {
        name,
        storeId,
        createdById: user.userId,
      },
    });
  }

  async addItem(sessionId: string, addDto: AddInventoryCountItemDto, user: AuthUser) {
    const { storeProductId, physicalStock } = addDto;

    const session = await this.assertSessionAccess(sessionId, user);

    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    if (session.finalizedAt) {
      throw new BadRequestException('La sesión de conteo ya está finalizada');
    }

    // Verificar si el producto ya fue contado en esta sesión
    const existingItem = await this.prisma.inventoryCountItem.findFirst({
      where: {
        sessionId,
        storeProductId,
      },
    });

    if (existingItem) {
      throw new BadRequestException('Este producto ya fue registrado en esta sesión. Use el endpoint de actualización.');
    }

    // Obtener el producto de la tienda para ver el stock esperado actual
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id: storeProductId },
      include: {
        store: {
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    if (!storeProduct) {
      throw new NotFoundException('Producto de tienda no encontrado');
    }

    if (!storeProduct.store?.tenantId || storeProduct.store.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para acceder a este producto de tienda');
    }

    // Verificar que el producto pertenezca a la misma tienda de la sesión
    if (storeProduct.storeId !== session.storeId) {
      throw new BadRequestException('El producto no pertenece a la tienda de la sesión de conteo');
    }

    const expectedStock = storeProduct.stock;
    const difference = physicalStock - expectedStock;

    return this.prisma.inventoryCountItem.create({
      data: {
        sessionId,
        storeProductId,
        expectedStock,
        physicalStock,
        difference,
      },
      include: {
        storeProduct: {
          include: {
            product: true
          }
        }
      }
    });
  }

  async updateItem(itemId: string, updateDto: UpdateInventoryCountItemDto, user: AuthUser) {
    const { physicalStock } = updateDto;

    const item = await this.prisma.inventoryCountItem.findUnique({
      where: { id: itemId },
      include: {
        session: {
          include: {
            store: {
              select: {
                id: true,
                tenantId: true,
              },
            },
          },
        },
      }
    });

    if (!item) {
      throw new NotFoundException('Item de conteo no encontrado');
    }

    if (item.session.finalizedAt) {
      throw new BadRequestException('La sesión de conteo ya está finalizada');
    }

    await this.assertSessionAccess(item.sessionId, user);

    // Recalcular diferencia manteniendo el expectedStock original (snapshot)
    // Opcional: ¿Deberíamos actualizar expectedStock? Generalmente no, para ver la foto del momento.
    const difference = physicalStock - item.expectedStock;

    return this.prisma.inventoryCountItem.update({
      where: { id: itemId },
      data: {
        physicalStock,
        difference,
      },
      include: {
        storeProduct: {
          include: {
            product: true
          }
        }
      }
    });
  }

  async closeSession(sessionId: string, user: AuthUser) {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const session = await this.assertSessionAccess(sessionId, user);

    if (session.finalizedAt) {
      throw new BadRequestException('La sesión ya está cerrada');
    }

    // Cerrar la sesión
    const closedSession = await this.prisma.inventoryCountSession.update({
      where: { id: sessionId },
      data: {
        finalizedAt: new Date(),
      },
      include: {
        store: true,
        items: {
          include: {
            storeProduct: {
              include: {
                product: true
              }
            }
          }
        }
      },
    });

    const createdBy = await this.prisma.user.findFirst({
      where: {
        id: closedSession.createdById,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Calcular resumen
    const totalProducts = closedSession.items.length;
    const countedProducts = closedSession.items.filter(item => item.physicalStock !== null).length;
    const correctCount = closedSession.items.filter(item => item.difference === 0).length;
    const discrepancies = totalProducts - correctCount;
    const positiveDiscrepancies = closedSession.items.filter(item => item.difference > 0).length;
    const negativeDiscrepancies = closedSession.items.filter(item => item.difference < 0).length;

    // Formatear respuesta
    return {
      session: {
        id: closedSession.id,
        name: closedSession.name,
        createdAt: closedSession.createdAt,
        finalizedAt: closedSession.finalizedAt,
        store: {
          id: closedSession.store.id,
          name: closedSession.store.name
        },
        createdBy: {
          id: createdBy?.id || closedSession.createdById,
          name: createdBy?.name || 'Desconocido'
        }
      },
      summary: {
        totalProducts,
        countedProducts,
        correctCount,
        discrepancies,
        positiveDiscrepancies,
        negativeDiscrepancies
      },
      items: closedSession.items.map(item => ({
        storeProduct: {
          id: item.storeProduct.id,
          product: {
            name: item.storeProduct.product.name,
            description: item.storeProduct.product.description
          }
        },
        expectedStock: item.expectedStock,
        physicalStock: item.physicalStock,
        difference: item.difference
      }))
    };
  }

  async getSessionReport(sessionId: string, user: AuthUser) {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    await this.assertSessionAccess(sessionId, user);

    const session = await this.prisma.inventoryCountSession.findFirst({
      where: {
        id: sessionId,
        store: {
          tenantId,
        },
      },
      include: {
        store: true,
        items: {
          include: {
            storeProduct: {
              include: {
                product: true
              }
            }
          }
        }
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión de conteo no encontrada');
    }

    const createdBy = await this.prisma.user.findFirst({
      where: {
        id: session.createdById,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return {
      ...session,
      createdBy,
    };
  }

  async deleteSession(sessionId: string, user: AuthUser) {
    // Solo se permite eliminar si no está finalizada (o lógica de negocio adicional)
    // El usuario pidió "solo admins", eso se valida en el controller/guard.
    
    await this.assertSessionAccess(sessionId, user);

    return this.prisma.inventoryCountSession.delete({
      where: { id: sessionId },
    });
  }

  async findAllSessions(user: AuthUser, storeId?: string) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    if (storeId) {
      await this.assertStoreAccess(storeId, user);
    }

    const where: any = {
      ...(storeId ? { storeId } : {}),
      store: {
        tenantId,
        ...(user.role !== 'ADMIN'
          ? {
              storeUsers: {
                some: {
                  userId: user.userId,
                },
              },
            }
          : {}),
      },
    };
    
    return this.prisma.inventoryCountSession.findMany({
      where,
      include: {
        store: true,
        createdBy: {
          select: {
            name: true
          }
        },
        _count: {
          select: { items: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }
}
