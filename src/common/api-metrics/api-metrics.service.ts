import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type ApiMetricKey = string;

type ApiMetricAccumulator = {
  method: string;
  endpoint: string;
  tenantId: string | null | undefined;
  requestsCount: number;
  errorsCount: number;
  latencySumMs: number;
};

@Injectable()
export class ApiMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiMetricsService.name);

  private readonly metrics = new Map<ApiMetricKey, ApiMetricAccumulator>();
  private flushTimer: NodeJS.Timeout | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, 60_000);

    if (typeof this.flushTimer?.unref === 'function') {
      this.flushTimer.unref();
    }
  }

  async onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    await this.flush();
  }

  track(params: {
    method: string;
    endpoint: string;
    statusCode: number;
    latencyMs: number;
    tenantId?: string;
  }) {
    const method = params.method.toUpperCase();
    const endpoint = params.endpoint;
    const key: ApiMetricKey = `${method} ${endpoint}`;

    const current = this.metrics.get(key);
    const isError = params.statusCode >= 400;

    if (!current) {
      this.metrics.set(key, {
        method,
        endpoint,
        tenantId: params.tenantId,
        requestsCount: 1,
        errorsCount: isError ? 1 : 0,
        latencySumMs: params.latencyMs,
      });
      return;
    }

    current.requestsCount += 1;
    if (isError) current.errorsCount += 1;
    current.latencySumMs += params.latencyMs;

    if (typeof params.tenantId === 'string' && params.tenantId.length > 0) {
      if (current.tenantId === undefined) {
        current.tenantId = params.tenantId;
      } else if (current.tenantId === null) {
        return;
      } else if (current.tenantId !== params.tenantId) {
        current.tenantId = null;
      }
    }
  }

  private getIntervalStart(now: Date): Date {
    const ms = now.getTime();
    const rounded = Math.floor(ms / 30_000) * 30_000;
    return new Date(rounded);
  }

  async flush(): Promise<void> {
    if (this.metrics.size === 0) return;

    const now = new Date();
    const intervalStart = this.getIntervalStart(now);

    const snapshot = Array.from(this.metrics.values());
    this.metrics.clear();

    const data = snapshot.map((m) => ({
      intervalStart,
      intervalMinutes: 1,
      endpoint: m.endpoint,
      method: m.method,
      requestsCount: m.requestsCount,
      errorsCount: m.errorsCount,
      avgLatencyMs: m.requestsCount > 0 ? m.latencySumMs / m.requestsCount : 0,
      tenantId: m.tenantId ?? null,
    }));

    try {
      await this.prisma.apiMetric.createMany({
        data,
      });
    } catch (err) {
      this.logger.error('Error haciendo flush de métricas de API', err as any);
    }
  }
}
