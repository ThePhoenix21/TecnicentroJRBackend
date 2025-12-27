import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, finalize, throwError } from 'rxjs';
import { ApiMetricsService } from './api-metrics.service';

@Injectable()
export class ApiMetricsInterceptor implements NestInterceptor {
  constructor(private readonly apiMetrics: ApiMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req: any = http.getRequest();
    const res: any = http.getResponse();

    const startMs = Date.now();

    const method: string = String(req?.method ?? 'GET').toUpperCase();
    const endpoint = this.getNormalizedEndpoint(req);
    const tenantId: string | undefined = req?.user?.tenantId;

    let finalStatusCode = 200;

    return next.handle().pipe(
      catchError((err) => {
        finalStatusCode = this.getStatusCodeFromError(err);
        return throwError(() => err);
      }),
      finalize(() => {
        if (finalStatusCode === 200) {
          const statusFromRes = Number(res?.statusCode);
          if (Number.isFinite(statusFromRes) && statusFromRes > 0) {
            finalStatusCode = statusFromRes;
          }
        }

        const latencyMs = Date.now() - startMs;
        this.apiMetrics.track({
          method,
          endpoint,
          statusCode: finalStatusCode,
          latencyMs,
          tenantId,
        });
      }),
    );
  }

  private getStatusCodeFromError(err: unknown): number {
    if (err instanceof HttpException) {
      const code = err.getStatus();
      if (typeof code === 'number') return code;
    }
    const maybeStatus = (err as any)?.status;
    if (typeof maybeStatus === 'number') return maybeStatus;
    return 500;
  }

  private getNormalizedEndpoint(req: any): string {
    const baseUrl = typeof req?.baseUrl === 'string' ? req.baseUrl : '';
    const routePath = req?.route?.path;

    if (typeof routePath === 'string' && routePath.length > 0) {
      const full = `${baseUrl}${routePath}`;
      return full.startsWith('/') ? full : `/${full}`;
    }

    const rawUrl = String(req?.originalUrl ?? req?.url ?? '/');
    const pathOnly = rawUrl.split('?')[0] || '/';
    return pathOnly;
  }
}
