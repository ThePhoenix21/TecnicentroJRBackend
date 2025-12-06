import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { FilterInventoryMovementDto } from './dto/filter-inventory-movement.dto';
import { InventoryMovementType, Prisma } from '@prisma/client';

@Injectable()
export class InventoryMovementService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateInventoryMovementDto, userId: string) {
    const { storeProductId, type, quantity, description } = createDto;

    // 1. Validar StoreProduct
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id: storeProductId },
    });

    if (!storeProduct) {
      throw new NotFoundException('Producto de tienda no encontrado');
    }

    // 2. Determinar signo de la cantidad para el stock
    let stockChange = 0;
    
    // INCOMING: Aumenta stock (+)
    // OUTGOING: Disminuye stock (-)
    // ADJUST: Depende, pero aquí asumimos que el usuario envía la cantidad DEL MOVIMIENTO
    // Nota: Para ADJUST manual, es mejor usar "cantidad a ajustar" (+ o -). 
    // Pero si seguimos la lógica de "tipo de movimiento", ADJUST podría ser corrección.
    // Vamos a asumir: 
    // INCOMING -> +
    // OUTGOING -> -
    // ADJUST -> El usuario debe especificar si es positivo o negativo? 
    // En el DTO validamos quantity > 0.
    // Para ADJUST, podríamos permitir que el usuario defina si es suma o resta, O mejor:
    // Que ADJUST manual se comporte como una "entrada" o "salida" correctiva.
    // Por simplicidad y seguridad:
    // Si es OUTGOING o SALE -> Resta
    // Si es INCOMING o RETURN -> Suma
    // Si es ADJUST -> Vamos a requerir que el usuario use INCOMING/OUTGOING para correcciones manuales
    // O si usa ADJUST, asumimos que es una corrección positiva si no se especifica lo contrario.
    // PERO, para ser estrictos con el requerimiento: "Salida manual (OUTGOING)", "Entrada (INCOMING)".
    
    if (type === InventoryMovementType.INCOMING || type === InventoryMovementType.RETURN) {
      stockChange = quantity;
    } else if (type === InventoryMovementType.OUTGOING || type === InventoryMovementType.SALE) {
      stockChange = -quantity;
    } else if (type === InventoryMovementType.ADJUST) {
      // Para ajuste manual directo, asumimos que puede ser + o -
      // Pero como quantity en DTO es positivo, necesitamos saber la dirección.
      // Podríamos asumir que ADJUST manual es siempre "resetear" stock? No, eso es InventoryCount.
      // Vamos a permitir que ADJUST funcione como INCOMING por defecto, 
      // o el usuario debería usar INCOMING/OUTGOING para claridad.
      // Sin embargo, para cumplir con "Ajuste (ADJUST, solo supervisores)", 
      // asumiremos que ADJUST manual requiere un manejo especial o es simplemente un registro.
      // Vamos a tratarlo como una actualización directa de stock? No, InventoryMovement es un flujo.
      
      // Decisión: ADJUST manual sumará si quantity es positivo.
      // Si quieren restar, deberían enviar un negativo, pero el DTO valida min 1.
      // Solución: Permitir negativos en DTO para ADJUST, o usar un campo extra.
      // Simplificación: ADJUST manual en este endpoint sumará (corrección positiva).
      // Para corrección negativa (mermas), usar OUTGOING.
      stockChange = quantity; 
    }

    // Validar stock suficiente para salidas
    if (stockChange < 0 && (storeProduct.stock + stockChange < 0)) {
      throw new BadRequestException('Stock insuficiente para realizar esta salida');
    }

    return this.prisma.$transaction(async (prisma) => {
      // Crear movimiento
      const movement = await prisma.inventoryMovement.create({
        data: {
          storeProductId,
          type,
          quantity: stockChange, // Guardamos con signo
          description,
          userId,
        },
      });

      // Actualizar stock
      await prisma.storeProduct.update({
        where: { id: storeProductId },
        data: {
          stock: { increment: stockChange },
        },
      });

      return movement;
    });
  }

  async findAll(filterDto: FilterInventoryMovementDto) {
    const { storeId, storeProductId, startDate, endDate } = filterDto;
    
    const where: Prisma.InventoryMovementWhereInput = {};

    if (storeProductId) {
      where.storeProductId = storeProductId;
    }

    if (storeId) {
      // Filtrar por productos de esa tienda
      where.storeProduct = {
        storeId: storeId
      };
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    return this.prisma.inventoryMovement.findMany({
      where,
      include: {
        storeProduct: {
          include: {
            product: true,
            store: true
          }
        },
        user: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
  }

  async getDashboardStats(storeId?: string) {
    // Definir filtros de fecha (mes actual)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const whereStore = storeId ? { storeId } : {};

    // 1. Total entradas y salidas del mes
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['type'],
      where: {
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        },
        storeProduct: storeId ? { storeId } : undefined
      },
      _sum: {
        quantity: true
      }
    });

    // 2. Productos con stock crítico
    const criticalStockProducts = await this.prisma.storeProduct.findMany({
      where: {
        ...whereStore,
        stock: {
          lte: this.prisma.storeProduct.fields.stockThreshold // Comparar con columna stockThreshold
          // Nota: Prisma no soporta comparación directa entre columnas en where clause standard fácilmente
          // Se requiere raw query o filtrar en memoria si son pocos, o usar extensión.
          // Para simplificar y evitar raw query complejo ahora:
          // Filtramos donde stock <= 5 (valor por defecto seguro) O traer todos y filtrar JS.
        }
      },
      include: {
        product: true,
        store: true
      }
    });
    
    // Filtrado JS preciso para stock <= threshold
    const trueCriticalProducts = criticalStockProducts.filter(sp => sp.stock <= sp.stockThreshold);

    // Formatear stats
    const stats = {
      incoming: 0,
      outgoing: 0,
      sales: 0,
      adjustments: 0
    };

    movements.forEach(m => {
      const qty = Math.abs(m._sum.quantity || 0);
      if (m.type === 'INCOMING') stats.incoming = qty;
      if (m.type === 'OUTGOING') stats.outgoing = qty;
      if (m.type === 'SALE') stats.sales = qty;
      if (m.type === 'ADJUST') stats.adjustments = qty;
    });

    return {
      period: { start: startOfMonth, end: endOfMonth },
      stats,
      criticalProducts: trueCriticalProducts.map(p => ({
        id: p.id,
        name: p.product.name,
        store: p.store.name,
        stock: p.stock,
        threshold: p.stockThreshold,
        status: 'CRITICAL'
      }))
    };
  }

  async getProductMovements(storeProductId: string, limit: number = 5) {
    return this.prisma.inventoryMovement.findMany({
      where: { storeProductId },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        user: { select: { name: true } }
      }
    });
  }
}
