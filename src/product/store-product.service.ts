import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreProductDto } from './dto/create-store-product.dto';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import { StoreProduct } from './entities/store-product.entity';
import { ProductService } from './product.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';
import { InventoryMovementType } from '@prisma/client';
import { getPaginationParams, buildPaginatedResponse } from '../common/pagination/pagination.helper';
import { ListStoreProductsDto } from './dto/list-store-products.dto';
import { ListStoreProductsResponseDto } from './dto/list-store-products-response.dto';
import { StoreProductDetailDto } from './dto/store-product-detail.dto';

@Injectable()
export class StoreProductService {
  constructor(
    private prisma: PrismaService,
    private productService: ProductService
  ) {}

  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return value.toNumber();
  }

  async lookup(
    user: { tenantId?: string; userId: string; role: string },
    search?: string,
    storeId?: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    if (storeId) {
      const store = await this.prisma.store.findFirst({
        where: {
          id: storeId,
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
        select: { id: true },
      });

      if (!store) {
        throw new ForbiddenException('No tiene permisos para ver productos de esta tienda');
      }
    }

    const where: any = {
      tenantId,
      deletedAt: null,
      product: {
        isDeleted: false,
      },
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

    if (storeId) {
      where.storeId = storeId;
    }

    if (search) {
      where.product = {
        ...(where.product ?? {}),
        name: {
          contains: search,
          mode: 'insensitive',
        },
      };
    }

    const rows = await this.prisma.storeProduct.findMany({
      where,
      select: {
        id: true,
        product: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        product: {
          name: 'asc',
        },
      },
      //take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.product?.name ?? 'Producto sin nombre',
    }));
  }

  async list(filterDto: ListStoreProductsDto, user: { tenantId?: string; userId: string; role: string }): Promise<ListStoreProductsResponseDto> {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const storeId = filterDto.storeId;
    if (!storeId) {
      throw new BadRequestException('storeId es requerido');
    }

    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
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
      select: { id: true },
    });

    if (!store) {
      throw new ForbiddenException('No tiene permisos para ver productos de esta tienda');
    }

    const { page, pageSize, skip } = getPaginationParams({
      page: filterDto.page,
      pageSize: filterDto.pageSize,
      defaultPage: 1,
      defaultPageSize: 12,
      maxPageSize: 100,
    });

    const inStockParam = filterDto.inStock as unknown;
    const inStock =
      inStockParam === true ||
      inStockParam === 'true' ||
      inStockParam === 1 ||
      inStockParam === '1';

    const where: any = {
      storeId,
      store: { tenantId },
      tenantId,
      deletedAt: null,
      product: {
        isDeleted: false,
      },
    };

    if (inStock) {
      where.stock = {
        gt: 0,
      };
    }

    if (filterDto.name) {
      where.product = {
        ...(where.product ?? {}),
        name: {
          contains: filterDto.name,
          mode: 'insensitive',
        },
      };
    }

    const [total, storeProducts] = await Promise.all([
      this.prisma.storeProduct.count({ where }),
      this.prisma.storeProduct.findMany({
        where,
        select: {
          id: true,
          price: true,
          stock: true,
          product: {
            select: {
              name: true,
              buyCost: true,
              basePrice: true,
            },
          },
        },
        orderBy: {
          product: {
            name: 'asc',
          },
        },
        skip,
        take: pageSize,
      }),
    ]);

    const items = storeProducts.map((sp) => ({
      id: sp.id,
      name: sp.product?.name ?? 'Producto sin nombre',
      price: this.toNumber(sp.price),
      stock: sp.stock,
      buyCost: sp.product?.buyCost ? this.toNumber(sp.product.buyCost) : null,
      basePrice: sp.product?.basePrice ? this.toNumber(sp.product.basePrice) : null,
    }));

    return buildPaginatedResponse(items, total, page, pageSize);
  }

  async create(userId: string, tenantId: string, createStoreProductDto: CreateStoreProductDto): Promise<StoreProduct[]> {
    if (!userId) {
      throw new Error('Se requiere un ID de usuario válido para crear un producto en tienda');
    }

    if (!tenantId) {
      throw new Error('TenantId no encontrado en el token');
    }

    try {
      let productId: string;
      let catalogBasePrice = this.toNumber(createStoreProductDto.basePrice ?? 0);

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
          basePrice: this.toNumber(createStoreProductDto.basePrice),
          buyCost: this.toNumber(createStoreProductDto.buyCost),
          createdById: userId
        };

        const newProduct = await this.productService.create(createCatalogProductDto);
        productId = newProduct.id;
        catalogBasePrice = this.toNumber(newProduct.basePrice ?? catalogBasePrice);
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

        if (catalogProduct.isDeleted) {
          throw new NotFoundException(`Producto del catálogo con ID ${createStoreProductDto.productId} no encontrado`);
        }

        productId = createStoreProductDto.productId;
        catalogBasePrice = this.toNumber(catalogProduct.basePrice ?? catalogBasePrice);
      }

      // Verificar que la tienda exista
      const store = await this.prisma.store.findUnique({
        where: { id: createStoreProductDto.storeId }
      });

      if (!store) {
        throw new NotFoundException(`Tienda con ID ${createStoreProductDto.storeId} no encontrada`);
      }

      if (!store.tenantId || store.tenantId !== tenantId) {
        throw new ForbiddenException('No tienes permisos para agregar productos a esta tienda');
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

      // Obtener todas las tiendas disponibles
      const allStores = await this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true }
      });

      // Verificar si el producto ya existe en alguna tienda
      const existingStoreProducts = await this.prisma.storeProduct.findMany({
        where: {
          productId: productId,
          deletedAt: null,
          store: {
            tenantId,
          },
        } as any,
        select: { storeId: true }
      });

      const existingStoreIds = new Set(existingStoreProducts.map(sp => sp.storeId));

      // Determinar en qué tiendas se deben crear los storeProducts
      const storesToCreate = allStores.filter(store => !existingStoreIds.has(store.id));

      if (storesToCreate.length === 0) {
        throw new ForbiddenException('Este producto ya está registrado en todas las tiendas');
      }

      // Determinar el precio para la tienda origen (si no se envía, usar 0)
      const originPrice = this.toNumber(createStoreProductDto.price ?? catalogBasePrice);
      const priceForOtherStores = catalogBasePrice;

      // Crear los StoreProducts en todas las tiendas necesarias
      const storeProductsToCreate = storesToCreate.map(store => ({
        productId: productId,
        storeId: store.id,
        userId: userId,
        tenantId,
        price: store.id === createStoreProductDto.storeId 
          ? originPrice
          : priceForOtherStores, // Precio base para otras tiendas
        stock: store.id === createStoreProductDto.storeId 
          ? createStoreProductDto.stock 
          : 0, // Stock 0 para otras tiendas
        stockThreshold: store.id === createStoreProductDto.storeId 
          ? createStoreProductDto.stockThreshold 
          : undefined, // Threshold undefined para otras tiendas
      }));

      // Crear todos los storeProducts en una transacción
      const createdStoreProducts = await this.prisma.$transaction(
        storeProductsToCreate.map(data => 
          this.prisma.storeProduct.create({
            data,
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
          })
        )
      );

      return createdStoreProducts as unknown as StoreProduct[];
    } catch (error) {
      console.error('Error al crear producto en tienda:', error);
      throw new Error('No se pudo crear el producto en tienda: ' + (error as Error).message);
    }
  }

  async findByStore(tenantId: string, storeId: string, page: number = 1, limit: number = 20, search: string = ''): Promise<any> {
    const skip = (page - 1) * limit;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { tenantId: true },
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    if (!store.tenantId || store.tenantId !== tenantId) {
      throw new ForbiddenException('No tiene permisos para ver productos de esta tienda');
    }
    
    // Construir where clause para búsqueda
    let whereCondition: any = {
      storeId,
      store: { tenantId },
      tenantId,
      deletedAt: null,
      product: {
        isDeleted: false,
      },
    };
    
    if (search) {
      whereCondition.product = {
        ...(whereCondition.product ?? {}),
        name: {
          contains: search,
          mode: 'insensitive' // Búsqueda case-insensitive
        }
      };
    }
    
    // Obtener el total de productos para paginación
    const total = await this.prisma.storeProduct.count({
      where: whereCondition as any
    } as any);

    // Obtener los productos con paginación
    const storeProducts = await this.prisma.storeProduct.findMany({
      where: whereCondition as any,
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
    } as any);

    const totalPages = Math.ceil(total / limit);

    return {
      data: storeProducts,
      total,
      page,
      limit,
      totalPages
    };
  }

  async findByStoreSimple(tenantId: string, storeId: string, page: number = 1, limit: number = 20, search: string = ''): Promise<any> {
    const skip = (page - 1) * limit;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { tenantId: true },
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    if (!store.tenantId || store.tenantId !== tenantId) {
      throw new ForbiddenException('No tiene permisos para ver productos de esta tienda');
    }
    
    // Construir where clause para búsqueda
    let whereCondition: any = {
      storeId,
      store: { tenantId },
      deletedAt: null,
      tenantId,
      product: {
        isDeleted: false,
      },
    };
    
    if (search) {
      whereCondition.product = {
        ...(whereCondition.product ?? {}),
        name: {
          contains: search,
          mode: 'insensitive' // Búsqueda case-insensitive
        }
      };
    }
    
    // Obtener el total de productos para paginación
    const total = await this.prisma.storeProduct.count({
      where: whereCondition as any
    } as any);

    // Obtener los productos con paginación (solo campos básicos)
    const storeProducts = await this.prisma.storeProduct.findMany({
      where: whereCondition as any,
      select: {
        id: true,
        price: true,
        stock: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit
    } as any);

    const totalPages = Math.ceil(total / limit);

    return {
      data: storeProducts,
      total,
      page,
      limit,
      totalPages
    };
  }

  async updateStock(tenantId: string, userId: string, id: string, newStock: number, isAdmin: boolean = false, bypassOwnership: boolean = false): Promise<StoreProduct> {
    // Verificar que el StoreProduct existe
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true } },
        store: {
          select: {
            tenantId: true,
          },
        },
        product: {
          select: {
            isDeleted: true,
          },
        },
      },
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    if ((storeProduct as any).deletedAt) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    if (storeProduct.product?.isDeleted) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    // Si no es admin y no se permite saltar la restricción de propietario,
    // verificar que el producto pertenece al usuario
    if (!storeProduct.tenantId || storeProduct.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permiso para actualizar este producto');
    }

    if (!isAdmin && !bypassOwnership && storeProduct.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para actualizar este producto');
    }

    // Validar lógica de cambio de stock
    if (newStock < storeProduct.stock) {
      throw new BadRequestException('No se puede disminuir el stock desde esta opción. Use el módulo de Movimientos de Inventario (Salida Manual).');
    }

    // Si el stock es igual, no hacer nada
    if (newStock === storeProduct.stock) {
      return this.findOne(tenantId, id);
    }

    // Calcular diferencia positiva
    const difference = newStock - storeProduct.stock;

    // Ejecutar actualización y creación de movimiento en transacción
    return this.prisma.$transaction(async (prisma) => {
      // 1. Crear movimiento de inventario
      await prisma.inventoryMovement.create({
        data: {
          storeProductId: id,
          storeId: (storeProduct as any).storeId,
          type: InventoryMovementType.ADJUST,
          quantity: difference,
          description: 'Ajuste manual de stock desde edición de producto',
          userId: userId,
          tenantId,
        } as any
      });

      // 2. Actualizar el stock
      return prisma.storeProduct.update({
        where: { id },
        data: { stock: newStock },
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
    });
  }

  async findByUser(tenantId: string, userId: string): Promise<StoreProduct[]> {
    return this.prisma.storeProduct.findMany({
      where: {
        userId: userId,
        deletedAt: null,
        tenantId,
        store: { tenantId },
        product: { isDeleted: false },
      } as any,
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

  async findOne(tenantId: string, id: string): Promise<StoreProduct> {
    const storeProduct = await this.prisma.storeProduct.findFirst({
      where: {
        id,
        deletedAt: null,
        tenantId,
        store: { tenantId },
        product: { isDeleted: false },
      } as any,
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

  async findOneDetail(tenantId: string, id: string): Promise<StoreProductDetailDto> {
    const storeProduct = await this.findOne(tenantId, id);

    return {
      id: storeProduct.id,
      price: this.toNumber(storeProduct.price),
      stock: storeProduct.stock,
      stockThreshold: storeProduct.stockThreshold ? this.toNumber(storeProduct.stockThreshold) : 0,
      product: {
        id: storeProduct.product?.id ?? '',
        name: storeProduct.product?.name ?? 'Producto sin nombre',
        description: storeProduct.product?.description ?? null,
        basePrice: storeProduct.product?.basePrice ? this.toNumber(storeProduct.product.basePrice) : null,
        buyCost: storeProduct.product?.buyCost ? this.toNumber(storeProduct.product.buyCost) : null,
      },
      store: {
        name: storeProduct.store?.name ?? '',
        address: storeProduct.store?.address ?? null,
        phone: storeProduct.store?.phone ?? null,
      },
      user: {
        name: storeProduct.user?.name ?? null,
      },
    };
  }

  async update(
    userId: string,
    tenantId: string,
    id: string,
    updateData: UpdateStoreProductDto,
    isAdmin: boolean = false,
    bypassOwnership: boolean = false,
    options?: {
      allowCatalogFields?: boolean;
      allowCatalogPriceFields?: boolean;
    },
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
        product: true,
        tenant: { select: { id: true } },
        store: {
          select: {
            tenantId: true,
          },
        },
      }
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    console.log('StoreProduct encontrado:', JSON.stringify(storeProduct, null, 2));

    // Si no es admin y no se permite saltar la restricción de propietario,
    // verificar que el producto pertenece al usuario
    if (!isAdmin && !bypassOwnership && storeProduct.userId !== userId) {
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

    if (updateData.stockThreshold !== undefined) {
      console.log('Agregando stockThreshold a storeProductFields:', updateData.stockThreshold);
      storeProductFields.stockThreshold = updateData.stockThreshold;
    }

    const allowCatalogFields = options?.allowCatalogFields || isAdmin;
    const allowCatalogPrices = options?.allowCatalogPriceFields || isAdmin;

    if (allowCatalogFields) {
      if (updateData.name !== undefined) {
        console.log('Agregando name a productFields:', updateData.name);
        productFields.name = updateData.name;
      }
      if (updateData.description !== undefined) {
        console.log('Agregando description a productFields:', updateData.description);
        productFields.description = updateData.description;
      }
    }

    if (allowCatalogPrices) {
      if (updateData.buyCost !== undefined) {
        console.log('Agregando buyCost a productFields:', updateData.buyCost);
        productFields.buyCost = updateData.buyCost;
      }
      if (updateData.basePrice !== undefined) {
        console.log('Agregando basePrice a productFields:', updateData.basePrice);
        productFields.basePrice = this.toNumber(updateData.basePrice);
      }
    }

    console.log('storeProductFields finales:', JSON.stringify(storeProductFields, null, 2));
    console.log('productFields finales:', JSON.stringify(productFields, null, 2));

    // Validar que un usuario normal no intente modificar campos de administrador
    if (!allowCatalogFields || !allowCatalogPrices) {
      const forbiddenFields: string[] = [];
      if (!allowCatalogFields) {
        if (updateData.name !== undefined) forbiddenFields.push('name');
        if (updateData.description !== undefined) forbiddenFields.push('description');
      }
      if (!allowCatalogPrices) {
        if (updateData.buyCost !== undefined) forbiddenFields.push('buyCost');
        if (updateData.basePrice !== undefined) forbiddenFields.push('basePrice');
      }
      if (forbiddenFields.length > 0) {
        throw new ForbiddenException(`No tienes permisos para modificar los campos: ${forbiddenFields.join(', ')}`);
      }
    }

    // Actualizar el producto del catálogo si hay cambios permitidos
    if (Object.keys(productFields).length > 0) {
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

  async remove(tenantId: string, userId: string, id: string, isAdmin: boolean = false): Promise<void> {
    // Verificar que el StoreProduct existe
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            isDeleted: true,
          },
        },
        tenant: { select: { id: true } },
        store: {
          select: {
            tenantId: true,
          },
        },
      },
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    if (!storeProduct.store?.tenantId || storeProduct.store.tenantId !== tenantId || !storeProduct.tenantId || storeProduct.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permiso para eliminar este producto');
    }

    if ((storeProduct as any).deletedAt) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    if (storeProduct.product?.isDeleted) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    // Si no es admin, verificar que el producto pertenece al usuario
    if (!isAdmin && storeProduct.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para eliminar este producto');
    }

    // Soft delete (solo para esa tienda)
    await this.prisma.storeProduct.update({
      where: { id },
      data: { deletedAt: new Date() } as any,
    });
  }
}
