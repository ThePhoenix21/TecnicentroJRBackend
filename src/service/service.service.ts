import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service, ServiceStatus, ServiceType } from '@prisma/client';

@Injectable()
export class ServiceService {
  constructor(private prisma: PrismaService) {}

  async create(createServiceDto: CreateServiceDto): Promise<Service> {
    const { description, photoUrls, ...rest } = createServiceDto;
    const data: any = { ...rest };
    
    if (description !== undefined) {
      data.description = description;
    }
    
    if (photoUrls !== undefined) {
      data.photoUrls = photoUrls || [];
    }
    
    return this.prisma.service.create({
      data,
    });
  }

  async findAll(
    status?: ServiceStatus,
    type?: ServiceType,
  ): Promise<Service[]> {
    return this.prisma.service.findMany({
      where: {
        ...(status && { status }),
        ...(type && { type }),
      },
      include: {
        order: true,
      },
    });
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        order: true,
      },
    });

    if (!service) {
      throw new NotFoundException(`Servicio con ID ${id} no encontrado`);
    }

    return service;
  }

  async update(
    id: string,
    updateServiceDto: UpdateServiceDto,
  ): Promise<Service> {
    await this.findOne(id); // Verifica que el servicio exista

    return this.prisma.service.update({
      where: { id },
      data: updateServiceDto,
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.service.delete({
      where: { id },
    });
  }
}
