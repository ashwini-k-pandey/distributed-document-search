import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

export interface Document {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface CreateDocumentDTO {
  title: string;
  content: string;
}

export class ElasticsearchService {
  private client: Client;
  private index: string;

  constructor() {
    this.client = new Client({ 
      node: config.elasticsearch.node,
    });
    this.index = config.elasticsearch.index;
  }

  async ensureIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.index });
    if (!exists) {
      await this.client.indices.create({
        index: this.index,
        body: {
          mappings: {
            properties: {
              tenantId: { type: 'keyword' },
              title: { type: 'text' },
              content: { type: 'text' },
              createdAt: { type: 'date' }
            }
          }
        }
      });
      console.log(`Index ${this.index} created`);
    }
  }

  async indexDocument(tenantId: string, data: CreateDocumentDTO): Promise<Document> {
    const doc: Document = {
      id: uuidv4(),
      tenantId,
      title: data.title,
      content: data.content,
      createdAt: new Date().toISOString()
    };

    await this.client.index({
      index: this.index,
      id: doc.id,
      document: doc,
      refresh: 'wait_for' 
    });

    return doc;
  }

  async getDocument(tenantId: string, id: string): Promise<Document | null> {
    try {
      const result = await this.client.get<Document>({
        index: this.index,
        id
      });
      
      if (result._source && result._source.tenantId !== tenantId) {
        return null;
      }
      return result._source || null;
    } catch (e: any) {
      if (e.meta?.statusCode === 404) return null;
      throw e;
    }
  }

  async deleteDocument(tenantId: string, id: string): Promise<boolean> {
    const doc = await this.getDocument(tenantId, id);
    if (!doc) return false;

    await this.client.delete({
      index: this.index,
      id,
      refresh: 'wait_for'
    });
    return true;
  }

  async search(tenantId: string, query: string): Promise<Document[]> {
    const result = await this.client.search<Document>({
      index: this.index,
      body: {
        query: {
          bool: {
            must: [
              { multi_match: { query, fields: ['title', 'content'] } }
            ],
            filter: [
              { term: { tenantId } }
            ]
          }
        }
      }
    });
    
    return result.hits.hits.map(hit => hit._source as Document);
  }

  async health(): Promise<boolean> {
    try {
      await this.client.cluster.health();
      return true;
    } catch {
      return false;
    }
  }
}

export const esService = new ElasticsearchService();

