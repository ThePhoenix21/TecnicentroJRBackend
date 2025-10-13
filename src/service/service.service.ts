import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServiceResponseDto } from './dto/service-response.dto';
import { ServiceListResponseDto } from './dto/service-list-response.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ServiceType } from '@prisma/client';

@Injectable()
export class ServiceService {
  constructor(private prisma: PrismaService) {}

  async create(
    createServiceDto: CreateServiceDto,
    userId: string,
  ): Promise<ServiceResponseDto> {
    const { photoUrls = [], ...serviceData } = createServiceDto;
    
    const service = await this.prisma.service.create({
      data: {
        ...serviceData,
        photoUrls,
        user: {
          connect: { id: userId }
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return this.mapToServiceResponse(service);
  }

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<ServiceListResponseDto> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const [services, total] = await Promise.all([
      this.prisma.service.findMany({
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.service.count(),
    ]);

    const totalPages = Math.ceil(total / take);

    return {
      data: services.map(service => this.mapToServiceResponse(service)),
      total,
      page,
      limit: take,
      totalPages,
    };
  }

  async findOne(id: string): Promise<ServiceResponseDto> {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    return this.mapToServiceResponse(service);
  }

  async update(
    id: string,
    updateServiceDto: UpdateServiceDto,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<ServiceResponseDto> {
    // First, verify the service exists
    const existingService = await this.prisma.service.findUnique({
      where: { id },
    });

    if (!existingService) {
      throw new NotFoundException('Servicio no encontrado');
    }

    // Check if the user is the owner or an admin
    if (existingService.userId !== userId && !isAdmin) {
      throw new ForbiddenException('No tienes permiso para actualizar este servicio');
    }

    const { photoUrls, ...serviceData } = updateServiceDto;
    const updateData: any = { ...serviceData };
    
    if (photoUrls !== undefined) {
      updateData.photoUrls = photoUrls;
    }

    const updatedService = await this.prisma.service.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return this.mapToServiceResponse(updatedService);
  }

  async findByUserId(
    userId: string,
    paginationDto: PaginationDto,
  ): Promise<ServiceListResponseDto> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const [services, total] = await Promise.all([
      this.prisma.service.findMany({
        where: { userId },
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.service.count({ where: { userId } }),
    ]);

    const totalPages = Math.ceil(total / take);

    return {
      data: services.map(service => this.mapToServiceResponse(service)),
      total,
      page,
      limit: take,
      totalPages,
    };
  }

  private mapToServiceResponse(service: any): ServiceResponseDto {
    const response: ServiceResponseDto = {
      id: service.id,
      type: service.type,
      description: service.description,
      price: service.price,
      paid: service.paid,
      photoUrls: Array.isArray(service.photoUrls) ? service.photoUrls : [],
      createdById: service.userId || service.user?.id,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };

    // Si el usuario está incluido en la respuesta, lo agregamos
    if (service.user) {
      response.createdBy = {
        id: service.user.id,
        name: service.user.name || null,
        email: service.user.email
      };
    }

    return response;
  }

  async remove(id: string, userId: string, isAdmin: boolean = false): Promise<void> {
    const service = await this.prisma.service.findUnique({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    if (service.userId !== userId && !isAdmin) {
      throw new ForbiddenException('No tienes permiso para eliminar este servicio');
    }

    await this.prisma.service.delete({
      where: { id },
    });
  }
}
