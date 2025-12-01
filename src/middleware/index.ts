import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { cacheService } from '../services';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

export class Middleware {
  static tenant(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string || req.query.tenant as string;

    if (!tenantId) {
      return res.status(400).json({ error: 'Missing X-Tenant-ID header or tenant query param' });
    }

    req.tenantId = tenantId;
    next();
  }

  static async rateLimit(req: Request, res: Response, next: NextFunction) {
    if (!req.tenantId) return next();

    try {
      const count = await cacheService.incrementRateLimit(req.tenantId);
      
      res.setHeader('X-RateLimit-Limit', config.rateLimit.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimit.max - count));

      if (count > config.rateLimit.max) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      next();
    } catch (error) {
      console.error('Rate limit error:', error);
      next();
    }
  }
}

