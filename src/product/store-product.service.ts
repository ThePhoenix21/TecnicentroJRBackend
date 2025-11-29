import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreProductDto } from './dto/create-store-product.dto';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import { StoreProduct } from './entities/store-product.entity';
import { ProductService } from './product.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';

@Injectable()
export class StoreProductService {
  constructor(
    private prisma: PrismaService,
    private productService: ProductService
  ) {}

  async create(userId: string, createStoreProductDto: CreateStoreProductDto): Promise<StoreProduct> {
    if (!userId) {
      throw new Error('Se requiere un ID de usuario válido para crear un producto en tienda');
    }

    try {
      let productId: string;

      // Caso 1: Crear nuevo producto en el catálogo
      if (createStoreProductDto.createNewProduct) {
        // Validar que se proporcionen los campos necesarios para el nuevo producto
        if (!createStoreProductDto.name) {
          throw new Error('El nombre del producto es requerido cuando createNewProduct es true');
        }

        // Crear el producto en el catálogo
        const createCatalogProductDto: CreateCatalogProductDto = {
          name: createStoreProductDto.name,
          description: createStoreProductDto.description,
          basePrice: createStoreProductDto.basePrice,
          buyCost: createStoreProductDto.buyCost,
          createdById: userId
        };

        const newProduct = await this.productService.create(createCatalogProductDto);
        productId = newProduct.id;
      } 
      // Caso 2: Usar producto existente del catálogo
      else {
        if (!createStoreProductDto.productId) {
          throw new Error('El productId es requerido cuando createNewProduct es false');
        }

        // Verificar que el producto del catálogo exista
        const catalogProduct = await this.prisma.product.findUnique({
          where: { id: createStoreProductDto.productId }
        });

        if (!catalogProduct) {
          throw new NotFoundException(`Producto del catálogo con ID ${createStoreProductDto.productId} no encontrado`);
        }

        productId = createStoreProductDto.productId;
      }

      // Verificar que la tienda exista
      const store = await this.prisma.store.findUnique({
        where: { id: createStoreProductDto.storeId }
      });

      if (!store) {
        throw new NotFoundException(`Tienda con ID ${createStoreProductDto.storeId} no encontrada`);
      }

      // Verificar que el usuario tenga acceso a la tienda
      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId: createStoreProductDto.storeId,
          userId: userId
        }
      });

      if (!storeUser) {
        throw new ForbiddenException('No tienes permisos para agregar productos a esta tienda');
      }

      // Verificar si ya existe este producto en esta tienda
      const existingStoreProduct = await this.prisma.storeProduct.findFirst({
        where: {
          productId: productId,
          storeId: createStoreProductDto.storeId
        }
      });

      if (existingStoreProduct) {
        throw new ForbiddenException('Este producto ya está registrado en esta tienda');
      }

      // Crear el StoreProduct
      const storeProduct = await this.prisma.storeProduct.create({
        data: {
          productId: productId,
          storeId: createStoreProductDto.storeId,
          userId: userId,
          price: createStoreProductDto.price,
          stock: createStoreProductDto.stock,
          stockThreshold: createStoreProductDto.stockThreshold,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              basePrice: true,
              buyCost: true,
            },
          },
          store: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return storeProduct as unknown as StoreProduct;
    } catch (error) {
      console.error('Error al crear producto en tienda:', error);
      throw new Error('No se pudo crear el producto en tienda: ' + (error as Error).message);
    }
  }

  async findByStore(storeId: string, page: number = 1, limit: number = 20, search: string = ''): Promise<any> {
    const skip = (page - 1) * limit;
    
    // Construir where clause para búsqueda
    let whereCondition: any = { storeId };
    
    if (search) {
      whereCondition.product = {
        name: {
          contains: search,
          mode: 'insensitive' // Búsqueda case-insensitive
        }
      };
    }
    
    // Obtener el total de productos para paginación
    const total = await this.prisma.storeProduct.count({
      where: whereCondition
    });

    // Obtener los productos con paginación
    const storeProducts = await this.prisma.storeProduct.findMany({
      where: whereCondition,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: storeProducts,
      total,
      page,
      limit,
      totalPages
    };
  }

  async updateStock(userId: string, id: string, stock: number, isAdmin: boolean = false): Promise<StoreProduct> {
    // Verificar que el StoreProduct existe
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    // Si no es admin, verificar que el producto pertenece al usuario
    if (!isAdmin && storeProduct.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para actualizar este producto');
    }

    // Actualizar el stock
    return this.prisma.storeProduct.update({
      where: { id },
      data: { stock },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findByUser(userId: string): Promise<StoreProduct[]> {
    return this.prisma.storeProduct.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findOne(id: string): Promise<StoreProduct> {
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    return storeProduct as unknown as StoreProduct;
  }

  async update(
    userId: string,
    id: string,
    updateData: UpdateStoreProductDto,
    isAdmin: boolean = false
  ): Promise<StoreProduct> {
    console.log('=== DEBUG UPDATE STORE PRODUCT ===');
    console.log('userId:', userId);
    console.log('id:', id);
    console.log('isAdmin:', isAdmin);
    console.log('updateData recibido:', JSON.stringify(updateData, null, 2));
    
    // Verificar que el StoreProduct existe
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
      include: {
        product: true
      }
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    console.log('StoreProduct encontrado:', JSON.stringify(storeProduct, null, 2));

    // Si no es admin, verificar que el producto pertenece al usuario
    if (!isAdmin && storeProduct.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para actualizar este producto');
    }

    // Separar los campos de StoreProduct y los campos de Product
    const storeProductFields: any = {};
    const productFields: any = {};

    // Campos que siempre se pueden modificar (StoreProduct)
    if (updateData.price !== undefined) {
      console.log('Agregando price a storeProductFields:', updateData.price);
      storeProductFields.price = updateData.price;
    }
    if (updateData.stock !== undefined) {
      console.log('Agregando stock a storeProductFields:', updateData.stock);
      storeProductFields.stock = updateData.stock;
    }
    if (updateData.stockThreshold !== undefined) {
      console.log('Agregando stockThreshold a storeProductFields:', updateData.stockThreshold);
      storeProductFields.stockThreshold = updateData.stockThreshold;
    }

    // Campos que solo los administradores pueden modificar (Product)
    if (isAdmin) {
      if (updateData.name !== undefined) {
        console.log('Agregando name a productFields:', updateData.name);
        productFields.name = updateData.name;
      }
      if (updateData.description !== undefined) {
        console.log('Agregando description a productFields:', updateData.description);
        productFields.description = updateData.description;
      }
      if (updateData.buyCost !== undefined) {
        console.log('Agregando buyCost a productFields:', updateData.buyCost);
        productFields.buyCost = updateData.buyCost;
      }
      if (updateData.basePrice !== undefined) {
        console.log('Agregando basePrice a productFields:', updateData.basePrice);
        productFields.basePrice = updateData.basePrice;
      }
    }

    console.log('storeProductFields finales:', JSON.stringify(storeProductFields, null, 2));
    console.log('productFields finales:', JSON.stringify(productFields, null, 2));

    // Validar que un usuario normal no intente modificar campos de administrador
    if (!isAdmin) {
      const adminFields = ['name', 'description', 'buyCost', 'basePrice'];
      const attemptedAdminFields = adminFields.filter(field => updateData[field] !== undefined);
      if (attemptedAdminFields.length > 0) {
        throw new ForbiddenException(`Solo los administradores pueden modificar los campos: ${attemptedAdminFields.join(', ')}`);
      }
    }

    // Actualizar el producto del catálogo si hay cambios y es administrador
    if (Object.keys(productFields).length > 0 && isAdmin) {
      await this.prisma.product.update({
        where: { id: storeProduct.productId },
        data: productFields
      });
    }

    // Actualizar el StoreProduct si hay cambios
    if (Object.keys(storeProductFields).length > 0) {
      return this.prisma.storeProduct.update({
        where: { id },
        data: storeProductFields,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              basePrice: true,
              buyCost: true,
            },
          },
          store: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    }

    // Si no hay cambios en StoreProduct pero sí en Product, retornar el producto actualizado
    if (Object.keys(storeProductFields).length === 0 && Object.keys(productFields).length > 0) {
      const updatedStoreProduct = await this.prisma.storeProduct.findUnique({
        where: { id },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              basePrice: true,
              buyCost: true,
            },
          },
          store: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
      
      if (!updatedStoreProduct) {
        throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado después de la actualización`);
      }
      
      return updatedStoreProduct as unknown as StoreProduct;
    }

    // Si no hay cambios en ningún campo, retornar el producto actual
    const currentStoreProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!currentStoreProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    return currentStoreProduct as unknown as StoreProduct;
  }

  async remove(userId: string, id: string, isAdmin: boolean = false): Promise<void> {
    // Verificar que el StoreProduct existe
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    // Si no es admin, verificar que el producto pertenece al usuario
    if (!isAdmin && storeProduct.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para eliminar este producto');
    }

    // Eliminar el StoreProduct
    await this.prisma.storeProduct.delete({
      where: { id },
    });
  }
}
