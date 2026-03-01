import { Response } from 'express';
import { 
  BadRequestException, 
  ConflictException, 
  ForbiddenException, 
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException 
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { EmailValidatorService } from '../common/validators/email-validator.service';
import { Role } from './enums/role.enum';
import { ALL_PERMISSIONS } from './permissions';
import { DashboardService } from '../dashboard/dashboard.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly LOGIN_MODE_STORE = 'STORE';
  private readonly LOGIN_MODE_WAREHOUSE = 'WAREHOUSE';

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly emailValidator: EmailValidatorService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly dashboardService: DashboardService,
  ) {
    // Limpiar usuarios no verificados al iniciar
    this.cleanupUnverifiedAdminsOnStartup();
  }

  private hasPermission(permissions: string[] | undefined, permission: string): boolean {
    if (!permissions || permissions.length === 0) return false;
    return permissions.includes(permission);
  }

  private async getAccessibleStores(user: any): Promise<Array<{
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdById: string | null;
  }>> {
    if (user.role === Role.ADMIN) {
      return this.prisma.store.findMany({
        where: { tenantId: user.tenantId },
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
    }

    const userStores = await this.prisma.storeUsers.findMany({
      where: { userId: user.id },
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

    return userStores.map((us) => us.store);
  }

  private async getAccessibleWarehouses(user: any, storeIds: string[]): Promise<Array<{
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdById: string | null;
  }>> {
    if (user.role === Role.ADMIN) {
      return this.prisma.warehouse.findMany({
        where: { tenantId: user.tenantId },
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
    }

    const byStoreAssignments = storeIds.length > 0
      ? await this.prisma.warehouseStore.findMany({
          where: {
            storeId: { in: storeIds },
            warehouse: { tenantId: user.tenantId },
          },
          select: {
            warehouse: {
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
        })
      : [];

    const byEmployeeAssignments = await this.prisma.warehouseEmployed.findMany({
      where: {
        employed: {
          userId: user.id,
        },
        warehouse: {
          tenantId: user.tenantId,
        },
      },
      select: {
        warehouse: {
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

    const unique = new Map<string, {
      id: string;
      name: string;
      address: string | null;
      phone: string | null;
      createdAt: Date;
      updatedAt: Date;
      createdById: string | null;
    }>();

    for (const row of byStoreAssignments) {
      unique.set(row.warehouse.id, row.warehouse);
    }
    for (const row of byEmployeeAssignments) {
      unique.set(row.warehouse.id, row.warehouse);
    }

    return Array.from(unique.values());
  }

  private resolveActiveLoginContext(params: {
    userRole: string;
    stores: Array<{ id: string }>;
    warehouses: Array<{ id: string }>;
    loginMode?: string;
    storeId?: string;
    warehouseId?: string;
  }): { activeLoginMode: 'STORE' | 'WAREHOUSE' | null; activeStoreId: string | null; activeWarehouseId: string | null } {
    const { userRole, stores, warehouses, loginMode, storeId, warehouseId } = params;
    const storeIds = new Set(stores.map((s) => s.id));
    const warehouseIds = new Set(warehouses.map((w) => w.id));

    if (loginMode === this.LOGIN_MODE_STORE) {
      if (!storeId) {
        throw new BadRequestException('storeId es requerido para login en modo STORE');
      }
      if (!storeIds.has(storeId)) {
        throw new ForbiddenException('No tienes acceso a la tienda seleccionada');
      }
      return {
        activeLoginMode: this.LOGIN_MODE_STORE,
        activeStoreId: storeId,
        activeWarehouseId: null,
      };
    }

    if (loginMode === this.LOGIN_MODE_WAREHOUSE) {
      if (!warehouseId) {
        throw new BadRequestException('warehouseId es requerido para login en modo WAREHOUSE');
      }
      if (!warehouseIds.has(warehouseId)) {
        throw new ForbiddenException('No tienes acceso al almacén seleccionado');
      }
      return {
        activeLoginMode: this.LOGIN_MODE_WAREHOUSE,
        activeStoreId: null,
        activeWarehouseId: warehouseId,
      };
    }

    // Selección automática para USER cuando solo hay un contexto posible.
    if (userRole !== Role.ADMIN) {
      if (stores.length === 1 && warehouses.length === 0) {
        return {
          activeLoginMode: this.LOGIN_MODE_STORE,
          activeStoreId: stores[0].id,
          activeWarehouseId: null,
        };
      }

      if (warehouses.length === 1 && stores.length === 0) {
        return {
          activeLoginMode: this.LOGIN_MODE_WAREHOUSE,
          activeStoreId: null,
          activeWarehouseId: warehouses[0].id,
        };
      }

      if (stores.length === 1) {
        return {
          activeLoginMode: this.LOGIN_MODE_STORE,
          activeStoreId: stores[0].id,
          activeWarehouseId: null,
        };
      }

      if (warehouses.length === 1) {
        return {
          activeLoginMode: this.LOGIN_MODE_WAREHOUSE,
          activeStoreId: null,
          activeWarehouseId: warehouses[0].id,
        };
      }
    }

    return {
      activeLoginMode: null,
      activeStoreId: null,
      activeWarehouseId: null,
    };
  }

  async changeActiveContext(
    authUser: {
      userId: string;
      email: string;
      role: string;
      tenantId?: string;
      activeLoginMode?: 'STORE' | 'WAREHOUSE' | null;
      activeStoreId?: string | null;
      activeWarehouseId?: string | null;
    },
    body: { storeId?: string; warehouseId?: string },
    ipAddress: string,
    res: Response,
  ) {
    const user = await this.usersService.findById(authUser.userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (authUser.tenantId && user.tenantId && authUser.tenantId !== user.tenantId) {
      throw new UnauthorizedException('Tenant inválido');
    }

    const activeLoginMode = authUser.activeLoginMode ?? null;

    // Reglas estrictas de body: exactamente uno de los dos
    const hasStoreId = Boolean(body?.storeId);
    const hasWarehouseId = Boolean(body?.warehouseId);
    if ((hasStoreId && hasWarehouseId) || (!hasStoreId && !hasWarehouseId)) {
      throw new BadRequestException('Debe enviar solo storeId o warehouseId (nunca ambos)');
    }

    // Modo fijo hasta logout: solo permitimos activación inicial cuando activeLoginMode es null
    if (activeLoginMode !== null) {
      throw new ForbiddenException('No se permite cambiar el contexto/mode en la misma sesión');
    }

    const requestedLoginMode = hasStoreId ? this.LOGIN_MODE_STORE : this.LOGIN_MODE_WAREHOUSE;

    const stores = await this.getAccessibleStores(user);
    const warehouses = await this.getAccessibleWarehouses(
      user,
      stores.map((store) => store.id),
    );

    if (requestedLoginMode === this.LOGIN_MODE_STORE) {
      const ok = stores.some((s) => s.id === body.storeId);
      if (!ok) {
        throw new ForbiddenException('No tienes acceso a la tienda seleccionada');
      }
    }

    if (requestedLoginMode === this.LOGIN_MODE_WAREHOUSE) {
      const ok = warehouses.some((w) => w.id === body.warehouseId);
      if (!ok) {
        throw new ForbiddenException('No tienes acceso al almacén seleccionado');
      }
    }

    const tenant = user.tenantId
      ? await this.prisma.tenant.findUnique({
          where: { id: user.tenantId },
          select: { id: true, name: true, features: true, currency: true, logoUrl: true } as any,
        })
      : null;

    if (!tenant) {
      throw new UnauthorizedException('Tenant no encontrado');
    }

    const newPayload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      tenantId: (tenant as any).id,
      tenantName: (tenant as any).name,
      tenantFeatures: (tenant as any).features || [],
      tenantCurrency: (tenant as any).currency ?? 'PEN',
      tenantLogoUrl: (tenant as any).logoUrl ?? null,
      permissions: user.permissions || [],
      stores: stores.map((store) => store.id),
      warehouses: warehouses.map((warehouse) => warehouse.id),
      activeLoginMode: requestedLoginMode,
      activeStoreId: requestedLoginMode === this.LOGIN_MODE_STORE ? (body.storeId as string) : null,
      activeWarehouseId:
        requestedLoginMode === this.LOGIN_MODE_WAREHOUSE ? (body.warehouseId as string) : null,
    };

    const newAccessToken = this.jwtService.sign(newPayload);
    const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    await this.prisma.refreshToken.updateMany({
      where: {
        userId: user.id,
        revoked: false,
        expiresAt: { gte: new Date() },
      },
      data: {
        revoked: true,
      },
    });

    await this.prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        expiresAt: newExpiresAt,
        revoked: false,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(ipAddress && { lastLoginIp: ipAddress }),
      },
    });

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });

    return res.status(201).json({
      access_token: newAccessToken,
      accessToken: newAccessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role,
        permissions: user.permissions || [],
        verified: user.verified,
        stores,
        warehouses,
        activeLoginMode: requestedLoginMode,
        activeStoreId: newPayload.activeStoreId,
        activeWarehouseId: newPayload.activeWarehouseId,
      },
    });
  }

  private pickLandingView(params: {
    permissions: string[];
    tenantFeatures: string[];
  }): { view: string; reason: string } {
    const { permissions, tenantFeatures } = params;

    const hasFeature = (f: string) => tenantFeatures.includes(f);
    const has = (p: string) => this.hasPermission(permissions, p);

    if (has('VIEW_DASHBOARD') && hasFeature('DASHBOARD')) {
      return { view: 'DASHBOARD', reason: 'VIEW_DASHBOARD' };
    }

    if (has('VIEW_ORDERS') && hasFeature('SALES')) {
      return { view: 'SALES', reason: 'VIEW_ORDERS' };
    }

    if (has('VIEW_PRODUCTS') && hasFeature('PRODUCTS')) {
      return { view: 'PRODUCTS', reason: 'VIEW_PRODUCTS' };
    }

    if (has('VIEW_SERVICES') && hasFeature('SERVICES')) {
      return { view: 'SERVICES', reason: 'VIEW_SERVICES' };
    }

    if (has('VIEW_CLIENTS') && hasFeature('CLIENTS')) {
      return { view: 'CLIENTS', reason: 'VIEW_CLIENTS' };
    }

    if (has('VIEW_INVENTORY') && hasFeature('INVENTORY')) {
      return { view: 'INVENTORY', reason: 'VIEW_INVENTORY' };
    }

    if (has('VIEW_CASH') && hasFeature('CASH')) {
      return { view: 'CASH', reason: 'VIEW_CASH' };
    }

    return { view: 'NO_ACCESS', reason: 'NO_VIEW_PERMISSIONS' };
  }

  async loginBootstrap(email: string, password: string, ipAddress?: string, res?: Response) {
    const user = await this.validateUser(email, password);

    if (!user.tenantId) {
      throw new UnauthorizedException('Tenant no encontrado');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true, status: true, features: true, currency: true, logoUrl: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('Tenant no encontrado');
    }

    const tenantFeatures = (tenant.features || []) as unknown as string[];
    const permissions = (user.permissions || []) as string[];

    const loginResult = await this.login(user, ipAddress, res);

    const authUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const landing = this.pickLandingView({ permissions, tenantFeatures });

    let landingData: any = null;
    if (landing.view === 'DASHBOARD') {
      landingData = await this.dashboardService.getSummary(authUser);
    } else if (landing.view === 'SALES') {
      landingData = await this.dashboardService.getSalesBootstrap(authUser);
    }

    return {
      ...loginResult,
      stores: (loginResult as any)?.user?.stores ?? [],
      warehouses: (loginResult as any)?.user?.warehouses ?? [],
      activeLoginMode: (loginResult as any)?.user?.activeLoginMode ?? null,
      activeStoreId: (loginResult as any)?.user?.activeStoreId ?? null,
      activeWarehouseId: (loginResult as any)?.user?.activeWarehouseId ?? null,
      landing: {
        view: landing.view,
        reason: landing.reason,
        data: landingData,
      },
    };
  }

  // Se ejecuta al iniciar la aplicación
  private async cleanupUnverifiedAdminsOnStartup() {
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const result = await this.prisma.user.deleteMany({
        where: { 
          role: 'ADMIN',
          verified: false,
          createdAt: {
            lt: twentyFourHoursAgo
          }
        },
      });

      if (result.count > 0) {
        this.logger.log(`Se eliminaron ${result.count} administradores no verificados al iniciar`);
      }
    } catch (error) {
      this.logger.error('Error al limpiar administradores no verificados al iniciar:', error);
    }
  }

  // Se ejecuta todos los días a medianoche
  @Cron('0 0 * * *')
  async cleanupUnverifiedAdminsDaily() {
    this.logger.log('Iniciando limpieza diaria de administradores no verificados...');
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const result = await this.prisma.user.deleteMany({
        where: { 
          role: 'ADMIN',
          verified: false,
          createdAt: {
            lt: twentyFourHoursAgo
          }
        },
      });

      this.logger.log(`Limpieza diaria: Se eliminaron ${result.count} administradores no verificados`);
      return result;
    } catch (error) {
      this.logger.error('Error en la limpieza diaria de administradores no verificados:', error);
      throw error;
    }
  }

  // Limpia los tokens expirados todos los días a la medianoche
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredTokens() {
    this.logger.log('Iniciando limpieza de tokens expirados...');
    
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date() // Elimina tokens con fecha de expiración pasada
          }
        }
      });
      
      this.logger.log(`Se eliminaron ${result.count} tokens expirados`);
      return result;
    } catch (error) {
      this.logger.error('Error al limpiar tokens expirados:', error);
      throw error;
    }
  }

  // Limpia tokens huérfanos (sin usuario) el primer día de cada mes
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async cleanOrphanedTokens() {
    this.logger.log('Buscando tokens huérfanos...');
    
    try {
      // Encontrar todos los tokens con sus usuarios
      const allTokens = await this.prisma.refreshToken.findMany({
        include: { user: true }
      });
      
      // Filtrar tokens sin usuario
      const orphanedTokens = allTokens.filter(token => !token.user);

      if (orphanedTokens.length > 0) {
        this.logger.warn(`Encontrados ${orphanedTokens.length} tokens huérfanos`);
        const result = await this.prisma.refreshToken.deleteMany({
          where: {
            id: { in: orphanedTokens.map(t => t.id) }
          }
        });
        this.logger.log(`Tokens huérfanos eliminados: ${result.count}`);
        return result;
      }
      
      this.logger.log('No se encontraron tokens huérfanos');
      return { count: 0 };
    } catch (error) {
      this.logger.error('Error al limpiar tokens huérfanos:', error);
      throw error;
    }
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.verified) {
      throw new UnauthorizedException('Por favor verifica tu correo electrónico antes de iniciar sesión');
    }

    return user;
  }

  async validateUserByUsername(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar que el usuario tenga el rol USER
    if (user.role !== Role.USER) {
      throw new UnauthorizedException('Este método de autenticación es solo para usuarios regulares');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // No se requiere verificación de correo electrónico
    // para este método de autenticación

    return user;
  }

  async validateAnyUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return user;
  }

  async register(
    email: string,
    password: string,
    name: string,
    username: string,
    tenantId: string,
    phone: string = 'sin_telefono',
    birthdate?: Date,
    language: string = 'es',
    timezone: string = 'UTC',
    permissions: string[] = [] // Nuevo parámetro opcional
  ) {
    const normalizedEmail = String(email).trim().toLowerCase();

    // Verificar si el correo ya existe
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está en uso');
    }

    // Verificar si el nombre de usuario ya existe
    const existingUsername = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existingUsername) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }

    // Validar el formato del correo electrónico
    const isEmailValid = await this.emailValidator.isEmailValid(normalizedEmail);
    if (!isEmailValid) {
      throw new BadRequestException('El correo electrónico no es válido o el dominio no existe');
    }

    // Validar permisos contra catálogo
    if (permissions && permissions.length > 0) {
      const invalid = permissions.filter(p => !ALL_PERMISSIONS.includes(p));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Permisos inválidos: ${invalid.join(', ')}. Revise el catálogo de permisos disponibles.`,
        );
      }
    }

    // Este método registra un ADMIN: siempre debe quedar con TODOS los permisos
    const finalPermissions = ALL_PERMISSIONS;

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Crear token de verificación
    const verifyToken = randomBytes(32).toString('hex');
    const verifyTokenExpires = new Date();
    verifyTokenExpires.setHours(verifyTokenExpires.getHours() + 24); // Expira en 24 horas

    try {
      // Crear usuario
      const userData: Prisma.UserCreateInput = {
        email: normalizedEmail,
        password: hashedPassword,
        name,
        username,
        phone,
        birthdate: birthdate || null,
        language,
        timezone,
        verified: true,
        verifyToken,
        verifyTokenExpires,
        role: Role.ADMIN,
        status: 'ACTIVE' as const,
        tenant: { connect: { id: tenantId } },
        permissions: finalPermissions // Guardar permisos
      };

      const newUser = await this.prisma.user.create({ data: userData });

      // Si el usuario es ADMIN, crear registros en StoreUsers para todas las tiendas
      if (userData.role === Role.ADMIN) {
        const stores = await this.prisma.store.findMany({ where: { tenantId } });
        
        if (stores.length > 0) {
          const storeUsersData = stores.map(store => ({
            storeId: store.id,
            userId: newUser.id,
          }));

          await this.prisma.storeUsers.createMany({
            data: storeUsersData,
          });

          this.logger.log(`Se crearon ${storeUsersData.length} registros StoreUsers para el admin ${newUser.email}`);
        }
      }

      /*
      // Enviar correo de verificación
      await this.mailService.sendVerificationEmail(newUser.email, verifyToken, newUser.name);
      */

      // Programar limpieza si no se verifica
      this.scheduleUserCleanup(newUser.id);

      // No devolver la contraseña
      const { password: _, verifyToken: __, verifyTokenExpires: ___, ...result } = newUser;
      return result;
    } catch (error) {
      this.logger.error(`Error en el registro: ${error?.message || error}`, error?.stack);
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al registrar el usuario');
    }
  }

  private scheduleUserCleanup(userId: string) {
    // Ya no necesitamos el timeout individual ya que ahora tenemos la limpieza diaria
    // Solo registramos que el usuario necesita ser verificado
    this.logger.log(`Usuario ${userId} necesita verificación. Será verificado en la próxima limpieza diaria.`);
  }

  // Métodos existentes...
  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { 
        verifyToken: token, 
        verifyTokenExpires: { 
          gt: new Date() 
        } 
      },
    });

    if (!user) {
      throw new BadRequestException('Token inválido o expirado');
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { 
        verified: true, 
        verifyToken: null, 
        verifyTokenExpires: null 
      },
    });
  }

  async requestPasswordReset(email: string): Promise<boolean> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {      
      return true;
    }

    // Generar token y expiración
    const token = randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 30); // expira en 30 min

    // Guardar token en la base de datos
    await this.prisma.user.update({
      where: { id: user.id },
      data: { 
        passwordResetToken: token,
        passwordResetTokenExpires: expires
      },
    });

    // Enviar correo de restablecimiento
    await this.mailService.sendPasswordResetEmail(user.email, token);

    return true;
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetTokenExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Token inválido o expirado');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetTokenExpires: null,
      },
    });

    return true;
  }

  async login(
    user: any,
    ipAddress?: string,
    res?: Response,
    context?: { loginMode?: 'STORE' | 'WAREHOUSE'; storeId?: string; warehouseId?: string },
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true, status: true, features: true, currency: true, logoUrl: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('Tenant no encontrado');
    }

    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Su usuario ha sido desactivado. Por favor, póngase en contacto con soporte para más información.',
      );
    }

    const stores = await this.getAccessibleStores(user);
    const warehouses = await this.getAccessibleWarehouses(
      user,
      stores.map((store) => store.id),
    );

    const activeContext = this.resolveActiveLoginContext({
      userRole: user.role,
      stores,
      warehouses,
      loginMode: context?.loginMode,
      storeId: context?.storeId,
      warehouseId: context?.warehouseId,
    });

    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantFeatures: (tenant as any).features || [],
      tenantCurrency: (tenant as any).currency ?? 'PEN',
      tenantLogoUrl: (tenant as any).logoUrl ?? null,
      permissions: user.permissions || [],
      stores: stores.map((store) => store.id),
      warehouses: warehouses.map((warehouse) => warehouse.id),
      activeLoginMode: activeContext.activeLoginMode,
      activeStoreId: activeContext.activeStoreId,
      activeWarehouseId: activeContext.activeWarehouseId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
        revoked: false,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(ipAddress && { lastLoginIp: ipAddress }),
      },
    });

    if (res) {
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/auth/refresh',
      });
    }

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role,
        permissions: user.permissions || [],
        verified: user.verified,
        stores,
        warehouses,
        activeLoginMode: activeContext.activeLoginMode,
        activeStoreId: activeContext.activeStoreId,
        activeWarehouseId: activeContext.activeWarehouseId,
      },
    };
  }

  async refreshToken(refreshToken: string, ipAddress: string, res: Response) {
    try {
      const payload = this.jwtService.verify(refreshToken) as any;

      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: payload.sub,
          revoked: false,
          expiresAt: { gte: new Date() },
        },
      });

      if (!storedToken) {
        throw new UnauthorizedException('Token de refresco inválido o expirado');
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      if (!user.tenantId) {
        throw new UnauthorizedException('Tenant no encontrado');
      }

      const tenantId = user.tenantId;

      const stores = await this.getAccessibleStores(user);
      const warehouses = await this.getAccessibleWarehouses(
        user,
        stores.map((store) => store.id),
      );

      const activeContext = this.resolveActiveLoginContext({
        userRole: user.role,
        stores,
        warehouses,
        loginMode: payload?.activeLoginMode,
        storeId: payload?.activeStoreId,
        warehouseId: payload?.activeWarehouseId,
      });

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, features: true, currency: true, logoUrl: true } as any,
      });

      if (!tenant) {
        throw new UnauthorizedException('Tenant no encontrado');
      }

      const newPayload = {
        email: user.email,
        sub: user.id,
        role: user.role,
        tenantId: (tenant as any).id,
        tenantName: (tenant as any).name,
        tenantFeatures: (tenant as any).features || [],
        tenantCurrency: (tenant as any).currency ?? 'PEN',
        tenantLogoUrl: (tenant as any).logoUrl ?? null,
        permissions: user.permissions || [],
        stores: stores.map((store) => store.id),
        warehouses: warehouses.map((warehouse) => warehouse.id),
        activeLoginMode: activeContext.activeLoginMode,
        activeStoreId: activeContext.activeStoreId,
        activeWarehouseId: activeContext.activeWarehouseId,
      };

      const newAccessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 7);

      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          token: newRefreshToken,
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        },
      });

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          ...(ipAddress && { lastLoginIp: ipAddress }),
        },
      });

      res.cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/auth/refresh',
      });

      return res.status(201).json({
        access_token: newAccessToken,
        stores,
        warehouses,
        activeLoginMode: activeContext.activeLoginMode,
        activeStoreId: activeContext.activeStoreId,
        activeWarehouseId: activeContext.activeWarehouseId,
      });
    } catch (error) {
      this.logger.error(`Error al refrescar token: ${error?.message || error}`, error?.stack);
      throw new UnauthorizedException('Token de refresco inválido');
    }
  }
}
