# Distributed Document Search Service - Prototype

A simplified, functional prototype of a distributed document search service built with Node.js, Elasticsearch, and Redis. This prototype demonstrates core multi-tenancy and search capabilities with a minimal footprint.

## Features

- 🔍 **Full-text search** using Elasticsearch
- 🏢 **Multi-tenancy** with logical isolation (Tenant ID injection)
- ⚡ **Caching** using Redis for search results
- 🛡️ **Rate limiting** per tenant
- 🐳 **Docker-ready** setup

## Architecture Overview

```
┌──────────────┐     ┌─────────────┐     ┌──────────────────┐
│   Clients    │────▶│  API Layer  │────▶│  Elasticsearch   │
│              │     │  (Node.js)  │     │  (Search Engine) │
└──────────────┘     └──────┬──────┘     └──────────────────┘
                            │
                     ┌──────┴──────┐
                     ▼             ▼
              ┌───────────┐  ┌────────────┐
              │   Redis   │  │ Single     │
              │  (Cache)  │  │ Index/POD  │
              └───────────┘  └────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose

### 1. Clone and Install

```bash
cd distributed-document-search
npm install
```

### 2. Start Infrastructure

```bash
docker-compose up -d
```

### 3. Build and Run

```bash
npm run build
npm start
```

The server will start on port 3000.

## API Reference

### Authentication (Tenant ID)

All requests **must** include the Tenant ID via header or query parameter:
- Header: `X-Tenant-ID: <tenant-id>`
- Query: `?tenant=<tenant-id>`

### Endpoints

#### 1. Create Document
```bash
POST /documents
X-Tenant-ID: tenant-a
Content-Type: application/json

{
  "title": "My Document",
  "content": "This is some content for the document."
}
```

#### 2. Search Documents
```bash
GET /search?q=content
X-Tenant-ID: tenant-a
```

#### 3. Get Document by ID
```bash
GET /documents/{id}
X-Tenant-ID: tenant-a
```

#### 4. Delete Document
```bash
DELETE /documents/{id}
X-Tenant-ID: tenant-a
```

#### 5. Health Check
```bash
GET /health
```

## Configuration

Environment variables are defined in `.env` (or default values used in `src/config.ts`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | API server port |
| `ELASTICSEARCH_NODE` | http://localhost:9200 | Elasticsearch URL |
| `REDIS_HOST` | localhost | Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `RATE_LIMIT_MAX` | 20 | Max requests per minute per tenant |

## Project Structure

```
distributed-document-search/
├── src/
│   ├── config.ts            # Configuration
│   ├── index.ts             # Entry point
│   ├── controllers/         # Route handlers
│   │   ├── documents.controller.ts
│   │   └── search.controller.ts
│   ├── middleware/          # Tenant & Rate Limit middleware
│   │   └── index.ts
│   └── services/            # Business logic
│       ├── elasticsearch.service.ts
│       └── cache.service.ts
├── docker-compose.yml       # Infrastructure (ES + Redis)
├── Dockerfile               # API container
├── package.json
└── tsconfig.json
```

## License

MIT
