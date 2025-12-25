import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RATE_LIMIT_METADATA_KEY, RateLimitOptions } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req: any = http.getRequest();

    const controller = context.getClass()?.name ?? 'UnknownController';
    const handler = context.getHandler()?.name ?? 'unknownHandler';
    const handlerId = `${controller}.${handler}`;

    const ip = this.getClientIp(req);
    const userId = req?.user?.id ?? req?.user?.userId;

    const globalExceeded = this.applyRules({
      rules: [{ limit: 5000, windowSeconds: 3600 }],
      keyType: 'ip',
    }, { ip, userId, handlerId: 'global' });

    if (globalExceeded) {
      throw globalExceeded;
    }

    const options: RateLimitOptions | undefined = this.reflector.getAllAndOverride(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return next.handle();
    }

    const cooldownKey = this.buildKey(options.keyType ?? 'ip', { ip, userId }, handlerId);
    const cooldown = this.rateLimitService.isCooldownActive(cooldownKey);
    if (cooldown.active) {
      throw this.tooManyRequests(cooldown.resetAtMs);
    }

    const exceeded = this.applyRules(options, { ip, userId, handlerId });
    if (exceeded) {
      throw exceeded;
    }

    return next.handle();
  }

  private applyRules(
    options: RateLimitOptions,
    params: { ip: string; userId?: string; handlerId: string },
  ): HttpException | null {
    const keyType = options.keyType ?? 'ip';
    const key = this.buildKey(keyType, params, params.handlerId);

    for (const rule of options.rules) {
      const { count, resetAtMs } = this.rateLimitService.increment(key, rule.windowSeconds);
      if (count > rule.limit) {
        if (options.cooldownSeconds && options.cooldownSeconds > 0) {
          this.rateLimitService.setCooldown(key, options.cooldownSeconds);
        }
        return this.tooManyRequests(resetAtMs);
      }
    }

    return null;
  }

  private buildKey(
    keyType: 'ip' | 'user' | 'ip_user',
    params: { ip: string; userId?: string },
    handlerId: string,
  ): string {
    if (keyType === 'user') {
      const uid = params.userId ?? 'anonymous';
      return `rl:user:${uid}:${handlerId}`;
    }

    if (keyType === 'ip_user') {
      const uid = params.userId ?? 'anonymous';
      return `rl:ip_user:${params.ip}:${uid}:${handlerId}`;
    }

    return `rl:ip:${params.ip}:${handlerId}`;
  }

  private getClientIp(req: any): string {
    const xff = req?.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      return xff.split(',')[0].trim();
    }
    if (Array.isArray(xff) && xff.length > 0) {
      return String(xff[0]).split(',')[0].trim();
    }
    return req?.ip || req?.connection?.remoteAddress || 'unknown';
  }

  private tooManyRequests(resetAtMs?: number): HttpException {
    const retryAfterSeconds = resetAtMs ? Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000)) : 60;
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Demasiadas solicitudes, intente más tarde',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
