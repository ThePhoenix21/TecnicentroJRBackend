import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BasicAuthGuard } from './basic-auth.guard';

function parseDateParam(value: unknown, name: string): Date {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`Missing query param: ${name}`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid date for param: ${name}`);
  }
  return d;
}

@Controller('metrics')
@UseGuards(BasicAuthGuard)
export class ApiMetricsController {
  constructor(private readonly prisma: PrismaService) {}

  private whereRange(from: Date, to: Date, tenantId?: string): Prisma.Sql {
    console.log('whereRange - from (ISO):', from.toISOString(), 'to (ISO):', to.toISOString()); // DEBUG
    
    const clauses: Prisma.Sql[] = [
      Prisma.sql`"intervalStart" AT TIME ZONE 'UTC' >= ${from.toISOString()}::timestamptz`,
      Prisma.sql`"intervalStart" AT TIME ZONE 'UTC' <= ${to.toISOString()}::timestamptz`,
    ];

    if (typeof tenantId === 'string' && tenantId.trim().length > 0) {
      clauses.push(Prisma.sql`"tenantId" = ${tenantId.trim()}`);
    }

    return Prisma.sql`${Prisma.join(clauses, ' AND ')}`;
  }

  @Get('summary')
  async summary(
    @Query('from') fromRaw: string,
    @Query('to') toRaw: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const from = parseDateParam(fromRaw, 'from');
    const to = parseDateParam(toRaw, 'to');

    console.log('summary - raw dates from:', fromRaw, 'to:', toRaw); // DEBUG
    console.log('summary - from:', from, 'to:', to); // DEBUG

    if (from > to) {
      throw new BadRequestException('Invalid range: from must be <= to');
    }

    const where = this.whereRange(from, to, tenantId);
    console.log('summary - where:', where); // DEBUG

    const rows = await this.prisma.$queryRaw<
      Array<{
        totalRequests: bigint | number | null;
        totalErrors: bigint | number | null;
        avgLatencyMs: number | null;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM("requestsCount"), 0) AS "totalRequests",
        COALESCE(SUM("errorsCount"), 0) AS "totalErrors",
        CASE
          WHEN COALESCE(SUM("requestsCount"), 0) = 0 THEN 0
          ELSE (SUM(COALESCE("avgLatencyMs", 0) * "requestsCount") / SUM("requestsCount"))
        END AS "avgLatencyMs"
      FROM "ApiMetric"
      WHERE ${where}
    `);

    const row = rows[0] ?? { totalRequests: 0, totalErrors: 0, avgLatencyMs: 0 };

    return {
      totalRequests: Number(row.totalRequests ?? 0),
      totalErrors: Number(row.totalErrors ?? 0),
      avgLatencyMs: Number(row.avgLatencyMs ?? 0),
    };
  }

  @Get('timeseries')
  async timeseries(
    @Query('from') fromRaw: string,
    @Query('to') toRaw: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const from = parseDateParam(fromRaw, 'from');
    const to = parseDateParam(toRaw, 'to');

    console.log('timeseries - from:', from, 'to:', to); // DEBUG

    if (from > to) {
      throw new BadRequestException('Invalid range: from must be <= to');
    }

    const where = this.whereRange(from, to, tenantId);
    console.log('timeseries - where:', where); // DEBUG

    const rows = await this.prisma.$queryRaw<
      Array<{
        intervalStart: Date;
        requestsCount: bigint | number;
        errorsCount: bigint | number;
      }>
    >(Prisma.sql`
      SELECT
        "intervalStart" AS "intervalStart",
        SUM("requestsCount") AS "requestsCount",
        SUM("errorsCount") AS "errorsCount"
      FROM "ApiMetric"
      WHERE ${where}
      GROUP BY "intervalStart"
      ORDER BY "intervalStart" ASC
    `);

    return rows.map((r) => ({
      intervalStart: r.intervalStart,
      requestsCount: Number(r.requestsCount ?? 0),
      errorsCount: Number(r.errorsCount ?? 0),
    }));
  }

  @Get('endpoints')
  async endpoints(
    @Query('from') fromRaw: string,
    @Query('to') toRaw: string,
    @Query('tenantId') tenantId?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const from = parseDateParam(fromRaw, 'from');
    const to = parseDateParam(toRaw, 'to');

    console.log('endpoints - from:', from, 'to:', to); // DEBUG

    if (from > to) {
      throw new BadRequestException('Invalid range: from must be <= to');
    }

    let limit = 50;
    if (typeof limitRaw === 'string' && limitRaw.trim().length > 0) {
      const parsed = Number(limitRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new BadRequestException('Invalid limit');
      }
      limit = Math.min(500, Math.floor(parsed));
    }

    const where = this.whereRange(from, to, tenantId);
    console.log('endpoints - where:', where); // DEBUG

    const rows = await this.prisma.$queryRaw<
      Array<{
        endpoint: string;
        method: string;
        requestsCount: bigint | number;
        errorsCount: bigint | number;
        avgLatencyMs: number;
      }>
    >(Prisma.sql`
      SELECT
        "endpoint" AS "endpoint",
        "method" AS "method",
        SUM("requestsCount") AS "requestsCount",
        SUM("errorsCount") AS "errorsCount",
        CASE
          WHEN COALESCE(SUM("requestsCount"), 0) = 0 THEN 0
          ELSE (SUM(COALESCE("avgLatencyMs", 0) * "requestsCount") / SUM("requestsCount"))
        END AS "avgLatencyMs"
      FROM "ApiMetric"
      WHERE ${where}
      GROUP BY "endpoint", "method"
      ORDER BY SUM("requestsCount") DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => ({
      endpoint: r.endpoint,
      method: r.method,
      requestsCount: Number(r.requestsCount ?? 0),
      errorsCount: Number(r.errorsCount ?? 0),
      avgLatencyMs: Number(r.avgLatencyMs ?? 0),
    }));
  }
}
