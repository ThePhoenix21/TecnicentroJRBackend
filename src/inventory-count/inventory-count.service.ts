import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryCountSessionDto } from './dto/create-inventory-count-session.dto';
import { AddInventoryCountItemDto } from './dto/add-inventory-count-item.dto';
import { UpdateInventoryCountItemDto } from './dto/update-inventory-count-item.dto';

@Injectable()
export class InventoryCountService {
  constructor(private prisma: PrismaService) {}

  async createSession(createDto: CreateInventoryCountSessionDto, userId: string) {
    const { storeId, name } = createDto;

    // Verificar si la tienda existe
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new NotFoundException('Tienda no encontrada');
    }

    // Crear la sesión
    return this.prisma.inventoryCountSession.create({
      data: {
        name,
        storeId,
        createdById: userId,
      },
    });
  }

  async addItem(sessionId: string, addDto: AddInventoryCountItemDto, userId: string) {
    const { storeProductId, physicalStock } = addDto;

    // Verificar sesión
    const session = await this.prisma.inventoryCountSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Sesión de conteo no encontrada');
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
    });

    if (!storeProduct) {
      throw new NotFoundException('Producto de tienda no encontrado');
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

  async updateItem(itemId: string, updateDto: UpdateInventoryCountItemDto, userId: string) {
    const { physicalStock } = updateDto;

    const item = await this.prisma.inventoryCountItem.findUnique({
      where: { id: itemId },
      include: {
        session: true
      }
    });

    if (!item) {
      throw new NotFoundException('Item de conteo no encontrado');
    }

    if (item.session.finalizedAt) {
      throw new BadRequestException('La sesión de conteo ya está finalizada');
    }

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

  async closeSession(sessionId: string, userId: string) {
    const session = await this.prisma.inventoryCountSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Sesión de conteo no encontrada');
    }

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
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
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
          id: closedSession.createdBy.id,
          name: closedSession.createdBy.name
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

  async getSessionReport(sessionId: string) {
    const session = await this.prisma.inventoryCountSession.findUnique({
      where: { id: sessionId },
      include: {
        store: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
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

    return session;
  }

  async deleteSession(sessionId: string) {
    // Solo se permite eliminar si no está finalizada (o lógica de negocio adicional)
    // El usuario pidió "solo admins", eso se valida en el controller/guard.
    
    const session = await this.prisma.inventoryCountSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Sesión de conteo no encontrada');
    }

    return this.prisma.inventoryCountSession.delete({
      where: { id: sessionId },
    });
  }

  async findAllSessions(storeId?: string) {
    const where = storeId ? { storeId } : {};
    
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
