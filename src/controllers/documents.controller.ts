import { Router, Response, Request } from 'express';
import { esService, cacheService } from '../services';

export const documentRouter = Router();

documentRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content required' });
    }

    const doc = await esService.indexDocument(req.tenantId!, { title, content });
    res.status(201).json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

documentRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await esService.getDocument(req.tenantId!, req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

documentRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await esService.deleteDocument(req.tenantId!, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

