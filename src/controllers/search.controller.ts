import { Router, Response, Request } from 'express';
import { esService, cacheService } from '../services';

export const searchRouter = Router();

searchRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const cacheKey = `search:${req.tenantId}:${q}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return res.json({ source: 'cache', results: JSON.parse(cached) });
    }

    const results = await esService.search(req.tenantId!, q);
    await cacheService.set(cacheKey, JSON.stringify(results), 60);

    res.json({ source: 'elasticsearch', results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

