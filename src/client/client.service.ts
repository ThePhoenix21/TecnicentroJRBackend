import { 
  Injectable, 
  NotFoundException, 
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client, Prisma, SaleStatus } from '@prisma/client';
import { buildPaginatedResponse, getPaginationParams } from '../common/pagination/pagination.helper';
import { ListClientsDto } from './dto/list-clients.dto';
import { ListClientsResponseDto } from './dto/list-clients-response.dto';
import * as https from 'https';

type ReniecFallbackResult = {
  dni: string;
  name: string;
  source: 'RENIEC';
};

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(
    private prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private extractNameFromReniecPayload(payload: any): string | null {
    if (!payload || typeof payload !== 'object') return null;

    const directName =
      payload?.full_name ??
      payload?.nombre_completo ??
      payload?.nombreCompleto ??
      payload?.name ??
      payload?.data?.full_name ??
      payload?.data?.nombre_completo ??
      payload?.data?.nombreCompleto;

    if (typeof directName === 'string' && directName.trim().length > 0) {
      return directName.trim();
    }

    const names = [
      payload?.nombres ?? payload?.data?.nombres,
      payload?.apellidoPaterno ?? payload?.data?.apellidoPaterno,
      payload?.apellidoMaterno ?? payload?.data?.apellidoMaterno,
    ]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .map((part) => part.trim());

    return names.length ? names.join(' ') : null;
  }

  private async findPersonByDniInReniec(dni: string): Promise<ReniecFallbackResult | null> {
    const token =
      this.configService.get<string>('TOKEN_DECOLECTA') ||
      this.configService.get<string>('DECOLECTA_API_TOKEN');

    if (!token) {
      this.logger.warn('TOKEN_DECOLECTA no configurado. Se omite fallback RENIEC');
      return null;
    }

    const url = `https://api.decolecta.com/v1/reniec/dni?numero=${encodeURIComponent(dni)}`;

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const fetchFn = (globalThis as any)?.fetch as
        | undefined
        | ((input: any, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>);

      const requestViaHttps = () =>
        new Promise<{ ok: boolean; status: number; json: () => Promise<any> }>((resolve, reject) => {
          const req = https.request(
            url,
            {
              method: 'GET',
              headers,
            },
            (res) => {
              const status = res.statusCode ?? 0;
              let raw = '';
              res.setEncoding('utf8');
              res.on('data', (chunk) => (raw += chunk));
              res.on('end', () => {
                resolve({
                  ok: status >= 200 && status < 300,
                  status,
                  json: async () => {
                    try {
                      return raw ? JSON.parse(raw) : {};
                    } catch {
                      return {};
                    }
                  },
                });
              });
            },
          );

          req.on('error', reject);
          req.end();
        });

      const response = fetchFn
        ? await fetchFn(url, {
            method: 'GET',
            headers,
          })
        : await requestViaHttps();

      if (!response.ok) {
        if (response.status === 429) {
          this.logger.warn(`Fallback RENIEC sin cuota disponible para dni=${dni}`);
          return null;
        }

        if (response.status === 401 || response.status === 403) {
          this.logger.warn('Fallback RENIEC rechazado por credenciales (token inválido o sin permisos)');
          return null;
        }

        this.logger.warn(`Fallback RENIEC falló: status=${response.status} dni=${dni}`);
        return null;
      }

      const payload = await response.json();
      const fullName = this.extractNameFromReniecPayload(payload);

      if (!fullName) {
        const keys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 10).join(',') : '';
        this.logger.warn(`Fallback RENIEC sin nombre utilizable para dni=${dni} keys=[${keys}]`);
        return null;
      }

      return {
        dni,
        name: fullName,
        source: 'RENIEC',
      };
    } catch (error) {
      this.logger.error(`Error consultando fallback RENIEC para dni=${dni}: ${error?.message || error}`);
      return null;
    }
  }

  async create(createClientDto: CreateClientDto, tenantId?: string): Promise<Client> {
    try {
      if (!tenantId) {
        throw new BadRequestException('TenantId no encontrado en el token');
      }

      // Verificar si ya existe un cliente con el mismo email, RUC o DNI
      await this.checkExistingClient(createClientDto, undefined, tenantId);

      return await this.prisma.client.create({
        data: {
          name: createClientDto.name ?? null,
          email: createClientDto.email ?? null,
          phone: createClientDto.phone ?? null,
          address: createClientDto.address ?? null,
          ruc: createClientDto.ruc ?? null,
          dni: createClientDto.dni, // obligatorio, no null
          userId: createClientDto.userId,
          tenant: {
            connect: { id: tenantId },
          },
        } as any,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('El cliente ya existe con los datos proporcionados');
        }
      }
      throw new InternalServerErrorException('Error al crear el cliente');
    }
  }

  async list(query: ListClientsDto, tenantId?: string): Promise<ListClientsResponseDto> {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 12,
      maxPageSize: 100,
    });

    const where: any = {
      tenantId,
      deletedAt: null,
      ...(query.name ? { name: { contains: query.name, mode: 'insensitive' } } : {}),
      ...(query.phone ? { phone: { contains: query.phone, mode: 'insensitive' } } : {}),
      ...(query.dni ? { dni: { contains: query.dni, mode: 'insensitive' } } : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [total, clients] = await Promise.all([
      this.prisma.client.count({ where: where as any }),
      this.prisma.client.findMany({
        where: where as any,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          dni: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const clientIds = clients.map((c) => c.id);
    const [salesCounts, cancelledCounts] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['clientId'],
        where: {
          clientId: { in: clientIds },
          client: { tenantId },
          status: { not: SaleStatus.CANCELLED },
        },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['clientId'],
        where: {
          clientId: { in: clientIds },
          client: { tenantId },
          status: SaleStatus.CANCELLED,
        },
        _count: { _all: true },
      }),
    ]);

    const salesMap = new Map(salesCounts.map((i) => [i.clientId, i._count._all]));
    const cancelledMap = new Map(cancelledCounts.map((i) => [i.clientId, i._count._all]));

    return buildPaginatedResponse(
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        dni: c.dni,
        createdAt: c.createdAt,
        salesCount: salesMap.get(c.id) ?? 0,
        cancelledCount: cancelledMap.get(c.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    );
  }

  async lookupName(tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.prisma.client.findMany({
      where: { tenantId, deletedAt: null, name: { not: null } } as any,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async lookupPhone(tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.prisma.client.findMany({
      where: { tenantId, deletedAt: null, phone: { not: null } } as any,
      select: { id: true, phone: true },
      orderBy: { phone: 'asc' },
    });
  }

  async lookupDni(tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.prisma.client.findMany({
      where: { tenantId, deletedAt: null } as any,
      select: { id: true, dni: true },
      orderBy: { dni: 'asc' },
    });
  }

  async findOne(id: string, tenantId?: string): Promise<Client> {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null } as any,
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID "${id}" no encontrado`);
    }

    return client;
  }

  async getFull(id: string, tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null } as any,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        dni: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            name: true,
            role: true,
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          select: {
            orderNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            orderProducts: {
              select: {
                quantity: true,
                price: true,
                product: {
                  select: {
                    product: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
            services: {
              select: {
                name: true,
                price: true,
              },
            },
            paymentMethods: {
              select: {
                type: true,
                amount: true,
              },
            },
            cashSession: {
              select: {
                openedAt: true,
                closedAt: true,
                Store: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID "${id}" no encontrado`);
    }

    const fullClient = client as any;

    const decimalToNumber = (value: any) => {
      if (value === null || value === undefined) return value;
      return typeof value === 'number' ? value : Number(value);
    };

    return {
      userId: fullClient.userId,
      id: fullClient.id,
      name: fullClient.name,
      email: fullClient.email,
      phone: fullClient.phone,
      address: fullClient.address,
      dni: fullClient.dni,
      createdAt: fullClient.createdAt,
      createdBy: {
        name: fullClient.user?.name,
        role: fullClient.user?.role,
      },
      orders: (fullClient.orders || []).map((o: any) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        total: decimalToNumber(o.totalAmount),
        date: o.createdAt,
        items: [
          ...(o.orderProducts || []).map((p: any) => ({
            name: p.product?.product?.name,
            quantity: p.quantity,
            price: decimalToNumber(p.price),
          })),
          ...(o.services || []).map((s: any) => ({
            name: s.name,
            quantity: 1,
            price: decimalToNumber(s.price),
          })),
        ],
        payments: (o.paymentMethods || []).map((pm: any) => ({
          type: pm.type,
          amount: decimalToNumber(pm.amount),
        })),
        cashSession: o.cashSession
          ? {
              store: o.cashSession.Store?.name,
              openedAt: o.cashSession.openedAt,
              closedAt: o.cashSession.closedAt,
            }
          : null,
      })),
    };
  }

  async update(id: string, updateClientDto: UpdateClientDto, tenantId?: string): Promise<Client> {
    try {
      if (updateClientDto.dni !== undefined) {
        throw new BadRequestException('No se puede actualizar el DNI del cliente');
      }

      // Verificar si el cliente existe
      const existingClient = await this.findOne(id, tenantId);
      
      // Verificar si los nuevos datos entran en conflicto con otros clientes
      if (updateClientDto.email || updateClientDto.ruc) {
        await this.checkExistingClient(updateClientDto, id, (existingClient as any).tenantId);
      }

      return await this.prisma.client.update({
        where: { id },
        data: updateClientDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Los datos proporcionados ya están en uso por otro cliente');
        }
      }
      throw error;
    }
  }

  async remove(id: string, tenantId?: string): Promise<void> {
    throw new BadRequestException('Hard delete deshabilitado. Use el endpoint de soft delete.');
  }

  async search(query: string, tenantId?: string) {
    if (!query || query.trim().length < 3) {
      throw new BadRequestException('El término de búsqueda debe tener al menos 3 caracteres');
    }

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const searchTerm = `%${query}%`;
    
    // Usando consulta SQL en bruto para búsqueda insensible a mayúsculas/minúsculas
    return this.prisma.$queryRaw`
      SELECT * FROM "Client" 
      WHERE 
        "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND (
          LOWER("name") LIKE LOWER(${searchTerm}) OR
          LOWER("email") LIKE LOWER(${searchTerm}) OR
          "phone" LIKE ${searchTerm} OR
          "dni" LIKE ${searchTerm} OR
          "ruc" LIKE ${searchTerm}
        )
      LIMIT 20
    `;
  }

  // Buscar cliente por DNI en BD y, si no existe, consultar RENIEC como fallback.
  async findByDni(dni: string, tenantId?: string): Promise<Client | ReniecFallbackResult | null> {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const client = await this.prisma.client.findFirst({
      where: { tenantId, dni, deletedAt: null } as any,
    });

    if (client) {
      return client;
    }

    return this.findPersonByDniInReniec(dni);
  }

  async softDelete(id: string, tenantId?: string): Promise<Client> {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    await this.findOne(id, tenantId);

    return this.prisma.client.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      } as any,
    });
  }

  private async checkExistingClient(
    clientData: { email?: string | null; ruc?: string | null; dni?: string | null },
    excludeId?: string
    ,
    tenantId?: string
  ): Promise<void> {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const conditions: Prisma.ClientWhereInput[] = [];

    if (clientData.email) {
      conditions.push({ email: clientData.email });
    }
    if (clientData.ruc) {
      conditions.push({ ruc: clientData.ruc });
    }
    if (clientData.dni) {
      conditions.push({ dni: clientData.dni });
    }

    if (conditions.length === 0) return;

    const existingClient = await this.prisma.client.findFirst({
      where: {
        tenantId,
        OR: conditions,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: {
        email: true,
        ruc: true,
        dni: true,
      },
    });

    if (existingClient) {
      const conflicts: string[] = [];
      
      if (clientData.email && existingClient.email === clientData.email) {
        conflicts.push('email');
      }
      if (clientData.ruc && existingClient.ruc === clientData.ruc) {
        conflicts.push('RUC');
      }
      if (clientData.dni && existingClient.dni === clientData.dni) {
        conflicts.push('DNI');
      }
      
      if (conflicts.length > 0) {
        throw new ConflictException(
          `Ya existe un cliente con el mismo ${conflicts.join(', ')}`
        );
      }
    }
  }
}
