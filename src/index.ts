import express from 'express';
import { config } from './config';
import { esService, cacheService } from './services';
import { Middleware } from './middleware';
import { documentRouter } from './controllers/documents.controller';
import { searchRouter } from './controllers/search.controller';

const app = express();
app.use(express.json());

// Initialize ES index
esService.ensureIndex().catch(console.error);

// Health Check
app.get('/health', async (req, res) => {
  const esStatus = await esService.health();
  const redisStatus = await cacheService.health();
  
  const status = esStatus && redisStatus ? 'up' : 'degraded';
  
  res.status(status === 'up' ? 200 : 503).json({
    status,
    dependencies: {
      elasticsearch: esStatus ? 'up' : 'down',
      redis: redisStatus ? 'up' : 'down'
    }
  });
});

// Global Middleware
app.use(Middleware.tenant);
app.use(Middleware.rateLimit);

// Mount Routes
app.use('/documents', documentRouter);
app.use('/search', searchRouter);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
