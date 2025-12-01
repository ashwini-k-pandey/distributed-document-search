import Redis from 'ioredis';
import { config } from '../config';

export class CacheService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 1
    });
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<string> {
    return this.redis.setex(key, ttlSeconds, value);
  }

  async incrementRateLimit(tenantId: string): Promise<number> {
    const key = `ratelimit:${tenantId}`;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, 60); // 1 minute window
    }
    return current;
  }

  async health(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}

export const cacheService = new CacheService();

