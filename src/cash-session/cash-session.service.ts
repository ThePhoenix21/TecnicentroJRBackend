import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CreateCashSessionDto } from './dto/create-cash-session.dto';
import { UpdateCashSessionDto } from './dto/update-cash-session.dto';
import { PrismaService } from '../prisma/prisma.service';
import { User, SessionStatus } from '@prisma/client';

@Injectable()
export class CashSessionService {
  private readonly logger = new Logger(CashSessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createCashSessionDto: CreateCashSessionDto, user: { userId: string; email: string; role: string }) {
    console.log('Usuario recibido en servicio:', user);
    console.log('ID del usuario:', user?.userId);
    console.log('Email del usuario:', user?.email);
    
    const { storeId, openingAmount = 0.00 } = createCashSessionDto;
    
    this.logger.log(`Iniciando creación de sesión de caja para usuario: ${user.email} en tienda: ${storeId}`);

    try {
      // 1. Verificar que la tienda exista
      const store = await this.prisma.store.findUnique({
        where: { id: storeId }
      });
      
      if (!store) {
        this.logger.error(`Tienda no encontrada con ID: ${storeId}`);
        throw new NotFoundException('La tienda especificada no existe');
      }
      
      this.logger.debug(`Tienda encontrada: ${store.name} (ID: ${storeId})`);

      // 2. Validar que el usuario pertenezca a esa tienda (StoreUsers)
      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId: storeId,
          userId: user.userId
        }
      });

      if (!storeUser) {
        this.logger.warn(`Usuario ${user.email} no pertenece a la tienda ${storeId}`);
        throw new ForbiddenException('No tienes permisos para crear sesiones en esta tienda');
      }

      this.logger.debug(`Usuario ${user.email} verificado como miembro de la tienda ${storeId}`);

      // 3. Validar que no haya una sesión abierta para esa tienda
      const existingOpenSession = await this.prisma.cashSession.findFirst({
        where: {
          StoreId: storeId,
          status: SessionStatus.OPEN
        }
      });

      if (existingOpenSession) {
        this.logger.warn(`Ya existe una sesión abierta para la tienda ${storeId}: ${existingOpenSession.id}`);
        throw new ConflictException('Ya hay una sesión de caja abierta para esta tienda');
      }

      // 4. Crear la sesión de caja
      const newCashSession = await this.prisma.cashSession.create({
        data: {
          StoreId: storeId,
          UserId: user.userId,
          openedById: user.userId,
          openingAmount: openingAmount,
          status: SessionStatus.OPEN,
          openedAt: new Date()
        },
        include: {
          Store: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true
            }
          },
          User: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true
            }
          }
        }
      });

      this.logger.log(`Sesión de caja creada exitosamente: ${newCashSession.id} - Usuario: ${user.email} - Tienda: ${store.name}`);

      return {
        message: 'Sesión de caja creada exitosamente',
        cashSession: newCashSession
      };

    } catch (error) {
      this.logger.error(`Error al crear sesión de caja: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || 
          error instanceof ForbiddenException || 
          error instanceof ConflictException) {
        throw error;
      }
      
      throw new BadRequestException('Error al crear la sesión de caja');
    }
  }

  findAll() {
    return this.prisma.cashSession.findMany({
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true
          }
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        }
      },
      orderBy: {
        openedAt: 'desc'
      }
    });
  }

  findOne(id: string) {
    return this.prisma.cashSession.findUnique({
      where: { id },
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true
          }
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        },
        cashMovements: {
          include: {
            User: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });
  }

  update(id: string, updateCashSessionDto: UpdateCashSessionDto) {
    return this.prisma.cashSession.update({
      where: { id },
      data: updateCashSessionDto,
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true
          }
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        }
      }
    });
  }

  remove(id: string) {
    return this.prisma.cashSession.delete({
      where: { id }
    });
  }

  // Método adicional para obtener sesiones por tienda
  async findByStore(storeId: string) {
    return this.prisma.cashSession.findMany({
      where: { StoreId: storeId },
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true
          }
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        }
      },
      orderBy: {
        openedAt: 'desc'
      }
    });
  }

  // Método para obtener la sesión abierta actual de una tienda
  async findOpenSessionByStore(storeId: string) {
    return this.prisma.cashSession.findFirst({
      where: {
        StoreId: storeId,
        status: SessionStatus.OPEN
      },
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true
          }
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        }
      }
    });
  }
}
