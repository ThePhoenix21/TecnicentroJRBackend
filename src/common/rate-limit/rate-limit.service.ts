import { Injectable } from '@nestjs/common';

interface CounterEntry {
  count: number;
  resetAtMs: number;
}

@Injectable()
export class RateLimitService {
  private readonly counters = new Map<string, CounterEntry>();

  increment(key: string, windowSeconds: number): { count: number; resetAtMs: number } {
    const now = Date.now();
    const bucketKey = `${key}:${windowSeconds}`;

    const existing = this.counters.get(bucketKey);
    if (!existing || existing.resetAtMs <= now) {
      const resetAtMs = now + windowSeconds * 1000;
      const entry: CounterEntry = { count: 1, resetAtMs };
      this.counters.set(bucketKey, entry);
      return { count: entry.count, resetAtMs: entry.resetAtMs };
    }

    existing.count += 1;
    return { count: existing.count, resetAtMs: existing.resetAtMs };
  }

  isCooldownActive(key: string): { active: boolean; resetAtMs?: number } {
    const now = Date.now();
    const cooldownKey = `${key}:cooldown`;
    const entry = this.counters.get(cooldownKey);
    if (!entry) return { active: false };
    if (entry.resetAtMs <= now) {
      this.counters.delete(cooldownKey);
      return { active: false };
    }
    return { active: true, resetAtMs: entry.resetAtMs };
  }

  setCooldown(key: string, cooldownSeconds: number): { resetAtMs: number } {
    const now = Date.now();
    const cooldownKey = `${key}:cooldown`;
    const resetAtMs = now + cooldownSeconds * 1000;
    this.counters.set(cooldownKey, { count: 1, resetAtMs });
    return { resetAtMs };
  }
}
