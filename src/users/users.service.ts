import { 
  Injectable, 
  BadRequestException, 
  UnauthorizedException,
  Logger,
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { User, Role } from '@prisma/client';
import { ALL_PERMISSIONS } from '../auth/permissions';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(private prisma: PrismaService) {}

    private getTenantIdOrThrow(user?: AuthUser): string {
        const tenantId = user?.tenantId;
        if (!tenantId) {
            throw new UnauthorizedException('Tenant no encontrado en el token');
        }
        return tenantId;
    }

    private assertSelfOrAdmin(targetUserId: string, user?: AuthUser) {
        if (!user) return;
        if (user.role !== 'ADMIN' && user.userId !== targetUserId) {
            throw new UnauthorizedException('No tienes permisos para acceder a este usuario');
        }
    }

    private async assertUserBelongsToTenant(targetUserId: string, user?: AuthUser) {
        if (!user) return;
        const tenantId = this.getTenantIdOrThrow(user);
        this.assertSelfOrAdmin(targetUserId, user);

        const exists = await this.prisma.user.findFirst({
            where: {
                id: targetUserId,
                tenantId,
            },
            select: { id: true },
        });

        if (!exists) {
            throw new NotFoundException('Usuario no encontrado');
        }
    }

    /**
     * Crea un nuevo usuario en la base de datos.
     * 
     * Pasos que realiza:
     * 1. Verifica si ya existe un usuario con el mismo correo electrónico y lanza un error si es así.
     * 2. Valida la contraseña con una expresión regular para asegurar que:
     *    - Contenga al menos una letra mayúscula.
     *    - Contenga al menos un número.
     *    - Contenga al menos un carácter especial (*,@,!,#,%,&,?).
     *    - Tenga un mínimo de 6 caracteres.
     *    Si no cumple, lanza un BadRequestException con el mensaje correspondiente.
     * 3. Hashea la contraseña usando bcrypt con 10 salt rounds.
     * 4. Genera un token de verificación único (UUID v4) y valida que sea un UUID válido.
     * 5. Crea el usuario en la base de datos con los campos:
     *    - email, password (hasheada), name, username
     *    - verifyToken: token de verificación
     *    - verifyTokenExpires: fecha de expiración del token (24 horas)
     * 6. Retorna el usuario recién creado.
     */
    async createUser(email: string, password: string, name: string, username: string, storeId: string, phone?: string, birthdate?: Date, language?: string, timezone?: string, permissions?: string[], authUser?: AuthUser) {
        return this.create({
            email,
            password,
            name,
            username,
            phone,
            birthdate,
            language,
            timezone,
            role: Role.USER,
            storeId,
            permissions
        }, authUser);
    }

    async create(userData: {
        email: string;
        password: string;
        name: string;
        username: string;

        phone?: string;
        birthdate?: Date;
        language?: string;
        timezone?: string;
        role?: Role;
        verified?: boolean;
        storeId: string;
        permissions?: string[]; // Nuevos permisos
    }, authUser?: AuthUser) {
        const { email, password, name, username, phone, birthdate, language, timezone, role, verified = true, storeId, permissions = [] } = userData;
        
        this.logger.log(`Iniciando creación de usuario: ${username || email}`);

        // Validar que se proporcionó storeId (es obligatorio)
        if (!storeId) {
            this.logger.error('El ID de la tienda es obligatorio para crear un usuario');
            throw new BadRequestException('El ID de la tienda es obligatorio');
        }

        // Verificar que la tienda exista
        const store = await this.prisma.store.findUnique({
            where: { id: storeId }
        });
        
        if (!store) {
            this.logger.error(`Tienda no encontrada con ID: ${storeId}`);
            throw new NotFoundException('La tienda especificada no existe');
        }

        const tenantId = store.tenantId;

        if (!tenantId) {
            this.logger.error(`La tienda ${storeId} no tiene tenantId asociado`);
            throw new BadRequestException('La tienda especificada no tiene un tenant asociado');
        }

        if (authUser) {
            const requesterTenantId = this.getTenantIdOrThrow(authUser);
            if (requesterTenantId !== tenantId) {
                throw new UnauthorizedException('No tienes permisos para crear usuarios en otra empresa');
            }
        }
        
        this.logger.debug(`Tienda encontrada: ${store.name} (ID: ${storeId})`);

        const existing = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { username },
                    ...(phone ? [{ phone }] : [])
                ]
            }
        });

        if (existing) {
            if (existing.email === email) {
                throw new BadRequestException('El correo electrónico ya está registrado');
            }
            if (existing.username === username) {
                throw new BadRequestException('El nombre de usuario ya está en uso');
            }
            if (phone && existing.phone === phone) {
                throw new BadRequestException('El número de teléfono ya está registrado');
            }
        }

        // Validar contraseña
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[*@!#%&?])[A-Za-z\d*@!#%&?]{6,}$/;
        if (!passwordRegex.test(password)) {
            throw new BadRequestException(
                'La contraseña debe tener al menos una mayúscula, un número y un caracter especial (*,@,!,#,%,&,?)'
            );
        }

        // Asignar defaults
        const finalLanguage = language || 'indeterminado';
        const finalTimezone = timezone || 'UTC';
        const finalRole = role || Role.USER;

        // Validar permisos contra catálogo
        if (permissions && permissions.length > 0) {
            const invalid = permissions.filter(p => !ALL_PERMISSIONS.includes(p));
            if (invalid.length > 0) {
                throw new BadRequestException(
                    `Permisos inválidos: ${invalid.join(', ')}. Revise el catálogo de permisos disponibles.`,
                );
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verifyToken = this.generateToken();
        const verifyTokenExpires = new Date();
        verifyTokenExpires.setHours(verifyTokenExpires.getHours() + 24);

        // Crear usuario y StoreUsers en una transacción
        const result = await this.prisma.$transaction(async (tx) => {
            // Crear el usuario
            const newUser = await tx.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name,
                    username,
                    phone: phone || 'sin_telefono',
                    birthdate,
                    language: finalLanguage,
                    timezone: finalTimezone,
                    role: finalRole,
                    tenantId,
                    verifyToken,
                    verifyTokenExpires,
                    verified,
                    permissions: permissions || [], // Guardar permisos
                    lastLoginAt: new Date(),
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    username: true,
                    phone: true,
                    role: true,
                    permissions: true, // Retornar permisos
                    createdAt: true,
                    updatedAt: true,
                    lastLoginAt: true,
                    verified: true
                }
            });

            // Crear la relación en StoreUsers (ahora es obligatorio)
            await tx.storeUsers.create({
                data: {
                    storeId: storeId,
                    userId: newUser.id
                }
            });
            
            this.logger.debug(`Relación StoreUsers creada: Usuario ${newUser.id} -> Tienda ${storeId}`);

            return newUser;
        });

        this.logger.log(`Usuario creado exitosamente: ${result.id} - ${result.username || result.email}`);
        
        return result;
    }

    private generateToken(): string {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    async updatePasswordResetToken(userId: string, token: string, expires: Date, authUser?: AuthUser) {
        await this.assertUserBelongsToTenant(userId, authUser);
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                passwordResetToken: token,
                passwordResetTokenExpires: expires,
            },
        });
    }

    // Elimina un usuario de la base de datos por su ID (soft delete)
    async deleteUserById(id: string, authUser?: AuthUser) {
        await this.assertUserBelongsToTenant(id, authUser);
        // Verificar que el usuario exista
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        // Realizar soft delete cambiando el status a DELETED
        return this.prisma.user.update({
            where: { id },
            data: { status: 'DELETED' }
        });
    }

    async findByEmail(email: string) {
        if (!email) {
            throw new BadRequestException('El correo electrónico es requerido');
        }
        return this.prisma.user.findUnique({ where: { email } });
    }

    async findById(id: string, authUser?: AuthUser) {
        await this.assertUserBelongsToTenant(id, authUser);
        return this.prisma.user.findUnique({ where: { id } });
    }

    async findByUsername(username: string) {
        return this.prisma.user.findUnique({
            where: { username },
        });
    }

    // Buscar usuario por token de reseteo
    async findByResetToken(token: string): Promise<User | null> {
        return this.prisma.user.findFirst({
        where: { passwordResetToken: token },
        });
    }

    // Actualizar cualquier campo del usuario
    async update(userId: string, data: Partial<User>, authUser?: AuthUser): Promise<User> {
        await this.assertUserBelongsToTenant(userId, authUser);
        return this.prisma.user.update({
        where: { id: userId },
        data,
        });
    }

    async changePassword(email: string, currentPassword: string, newPassword: string) {
        // 1. Buscar usuario
        const user = await this.findByEmail(email);
        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado');
        }

        // 2. Verificar contraseña actual
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            throw new UnauthorizedException('La contraseña actual es incorrecta');
        }

        // 3. Validar que la nueva contraseña sea diferente a la actual
        if (currentPassword === newPassword) {
            throw new BadRequestException('La nueva contraseña debe ser diferente a la actual');
        }

        // 4. Validar fortaleza de la nueva contraseña
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?*]).{6,}$/;
        if (!passwordRegex.test(newPassword)) {
            throw new BadRequestException(
                'La nueva contraseña debe tener al menos 6 caracteres, una mayúscula, un número y un carácter especial (puede ser: !@#$%^&*()_+-=[]{};\':"\\|,.<>/?*)',
            );
        }

        // 5. Hashear la nueva contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 6. Actualizar password
        await this.updatePassword(user.id, hashedPassword);

        return true;
    }

    async updatePassword(userId: string, newPassword: string, authUser?: AuthUser) {
        await this.assertUserBelongsToTenant(userId, authUser);
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                password: newPassword,
                passwordChangedAt: new Date(),
            },
        });
    }

    async findOne(id: string, authUser?: AuthUser) {
        await this.assertUserBelongsToTenant(id, authUser);
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    async updateUser(id: string, updateUserDto: any, authUser?: AuthUser) {
        await this.assertUserBelongsToTenant(id, authUser);
        return this.prisma.user.update({
            where: { id },
            data: updateUserDto,
        });
    }

    async findAll(tenantId: string) {
        const users = await this.prisma.user.findMany({
            where: { tenantId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true,
                phone: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const usersWithStores = await Promise.all(
            users.map(async (user) => {
                let stores: { id: string; name: string; address: string | null; phone: string | null; createdAt: Date; updatedAt: Date; createdById: string | null }[] = [];

                if (user.role === 'ADMIN') {
                    stores = await this.prisma.store.findMany({
                        where: { tenantId },
                        select: {
                            id: true,
                            name: true,
                            address: true,
                            phone: true,
                            createdAt: true,
                            updatedAt: true,
                            createdById: true,
                        },
                    });
                } else {
                    const userStores = await this.prisma.storeUsers.findMany({
                        where: {
                            userId: user.id,
                            store: {
                                tenantId,
                            },
                        },
                        include: {
                            store: {
                                select: {
                                    id: true,
                                    name: true,
                                    address: true,
                                    phone: true,
                                    createdAt: true,
                                    updatedAt: true,
                                    createdById: true,
                                },
                            },
                        },
                    });

                    stores = userStores.map((us) => us.store);
                }

                return {
                    ...user,
                    stores,
                };
            }),
        );

        return usersWithStores;
    }
}