import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PrismaService } from '../prisma.service';
import { MailModule } from '../mail/mail.module';
import { JwtStrategy } from './jwt.strategy';
import { EmailValidatorService } from '../common/validators/email-validator.service';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => UsersModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MailModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'superSecretKey',
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    PrismaService,
    JwtStrategy,
    EmailValidatorService,
    RolesGuard
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, JwtStrategy, PassportModule, RolesGuard],
})
export class AuthModule {}