import { 
  Injectable, 
  NotFoundException, 
  ConflictException,
  BadRequestException,
  InternalServerErrorException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client, Prisma } from '@prisma/client';

type FindAllParams = {
  page?: number;
  limit?: number;
};

@Injectable()
export class ClientService {
  constructor(private prisma: PrismaService) {}

  async create(createClientDto: CreateClientDto): Promise<Client> {
    try {
      // Verificar si ya existe un cliente con el mismo email, RUC o DNI
      await this.checkExistingClient(createClientDto);

      return await this.prisma.client.create({
        data: {
          ...createClientDto,
          // Asegurarse de que los campos opcionales sean manejados correctamente
          email: createClientDto.email || null,
          phone: createClientDto.phone || null,
          address: createClientDto.address || null,
          ruc: createClientDto.ruc || null,
          dni: createClientDto.dni || null,
        },
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

  async findAll({ page = 1, limit = 10 }: FindAllParams = {}) {
    const skip = (page - 1) * limit;
    
    const [total, clients] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.client.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: clients,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID "${id}" no encontrado`);
    }

    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto): Promise<Client> {
    try {
      // Verificar si el cliente existe
      await this.findOne(id);
      
      // Verificar si los nuevos datos entran en conflicto con otros clientes
      if (updateClientDto.email || updateClientDto.ruc || updateClientDto.dni) {
        await this.checkExistingClient(updateClientDto, id);
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

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.client.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Cliente con ID "${id}" no encontrado`);
        }
      }
      throw error;
    }
  }

  async search(query: string) {
    if (!query || query.trim().length < 3) {
      throw new BadRequestException('El término de búsqueda debe tener al menos 3 caracteres');
    }

    const searchTerm = `%${query}%`;
    
    // Usando consulta SQL en bruto para búsqueda insensible a mayúsculas/minúsculas
    return this.prisma.$queryRaw`
      SELECT * FROM "Client" 
      WHERE 
        LOWER("name") LIKE LOWER(${searchTerm}) OR
        LOWER("email") LIKE LOWER(${searchTerm}) OR
        "phone" LIKE ${searchTerm} OR
        "dni" LIKE ${searchTerm} OR
        "ruc" LIKE ${searchTerm}
      LIMIT 20
    `;
  }

  private async checkExistingClient(
    clientData: { email?: string | null; ruc?: string | null; dni?: string | null },
    excludeId?: string
  ): Promise<void> {
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
