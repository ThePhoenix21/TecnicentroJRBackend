import { 
  Injectable, 
  BadRequestException, 
  UnauthorizedException 
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import { User, Role } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) {}

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
    async createUser(email: string, password: string, name: string, username: string, phone?: string, birthdate?: Date, language?: string, timezone?: string) {
        return this.create({
            email,
            password,
            name,
            username,
            phone,
            birthdate,
            language,
            timezone,
            role: Role.USER
        });
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
    }) {
        const { email, password, name, username, phone, birthdate, language, timezone, role } = userData;
        
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

        const hashedPassword = await bcrypt.hash(password, 10);
        const verifyToken = this.generateToken();
        const verifyTokenExpires = new Date();
        verifyTokenExpires.setHours(verifyTokenExpires.getHours() + 24);

        return this.prisma.user.create({
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
                verifyToken,
                verifyTokenExpires,
                lastLoginAt: new Date(),
            },
            select: {
                id: true,
                email: true,
                name: true,
                username: true,
                phone: true,
                role: true,
                createdAt: true,
                updatedAt: true,
                lastLoginAt: true,
                verified: true
            }
        });
    }

    private generateToken(): string {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    async updatePasswordResetToken(userId: string, token: string, expires: Date) {
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                passwordResetToken: token,
                passwordResetTokenExpires: expires,
            },
        });
    }

    // Elimina un usuario de la base de datos por su ID
    async deleteUserById(id: string) {
        return this.prisma.user.delete({ where: { id } });
    }

    async findByEmail(email: string) {
        if (!email) {
            throw new BadRequestException('El correo electrónico es requerido');
        }
        return this.prisma.user.findUnique({ where: { email } });
    }

    async findById(id: string) {
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
    async update(userId: string, data: Partial<User>): Promise<User> {
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
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{6,}$/;
        if (!passwordRegex.test(newPassword)) {
            throw new BadRequestException(
                'La nueva contraseña debe tener al menos 6 caracteres, una mayúscula, un número y un carácter especial',
            );
        }

        // 5. Hashear la nueva contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 6. Actualizar password
        await this.updatePassword(user.id, hashedPassword);

        return true;
    }

    async updatePassword(userId: string, newPassword: string) {
        return this.prisma.user.update({
            where: { id: userId },
            data: {
            password: newPassword,
            passwordChangedAt: new Date(),
            },
        });
    }

    async findOne(id: string) {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    async updateUser(id: string, updateUserDto: any) {
        return this.prisma.user.update({
            where: { id },
            data: updateUserDto,
        });
    }

    async findAll() {
        return this.prisma.user.findMany({
            select: {
            id: true,
            email: true,
            name: true,
            role: true,
            phone: true,
            createdAt: true,
            updatedAt: true,
            // Excluir campos sensibles como password, passwordResetToken, etc.
            },
            orderBy: {
            createdAt: 'desc', // Opcional: ordenar por fecha de creación
            },
        });
    }
}