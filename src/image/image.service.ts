import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateImageDto } from './dto/create-image.dto';
import { UpdateImageDto } from './dto/update-image.dto';

@Injectable()
export class ImageService {
  create(createImageDto: CreateImageDto, tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }
    return 'This action adds a new image';
  }

  findAll(tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }
    return `This action returns all image`;
  }

  findOne(id: number, tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }
    return `This action returns a #${id} image`;
  }

  update(id: number, updateImageDto: UpdateImageDto, tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }
    return `This action updates a #${id} image`;
  }

  remove(id: number, tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }
    return `This action removes a #${id} image`;
  }
}
