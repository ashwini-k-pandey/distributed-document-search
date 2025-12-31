# Distributed Document Search Service - Complete Submission

**Project:** Distributed Document Search  
**Repository:** https://github.com/ashwini-k-pandey/distributed-document-search  
**Date:** December 1, 2025  
**Status:** Production-Ready  

---

## Table of Contents

1. [Overview](#overview)
2. [AI Tools Usage](#ai-tools-usage)
3. [Architecture Design](#architecture-design)
4. [Production Readiness](#production-readiness)
5. [Enterprise Experience](#enterprise-experience)
6. [Getting Started](#getting-started)
7. [Submission Validation](#submission-validation)

---

## Overview

The **Distributed Document Search Service** is a production-ready prototype demonstrating enterprise-grade architecture for a multi-tenant document search platform. Built with Node.js, Elasticsearch, and Redis, the system showcases:

- **Multi-tenant architecture** with strict data isolation
- **Regional POD deployment** for data residency compliance
- **Production patterns** including caching, rate limiting, async processing
- **99.95% SLA design** with detailed operational procedures
- **Enterprise scalability** supporting 100x growth from baseline

### Key Differentiators

1. **Multi-Region POD Architecture**: Independent deployments per geographic region with tenant allocation at onboarding
2. **Single Index per POD**: Operational simplicity with query-layer isolation vs per-tenant indices
3. **Sliding Window Rate Limiting**: Per-API operation limits (search, index, bulk, etc.)
4. **Comprehensive Documentation**: Architecture decisions, production procedures, enterprise patterns
5. **Real Enterprise Experience**: Demonstrated expertise through Azure and Druva case studies

---

## AI Tools Usage

### Development Environment
- **GitHub Copilot**: Used throughout development for code generation, architectural suggestions, and documentation
- **Claude (Claude Haiku 4.5)**: Used for detailed architectural analysis, documentation review, and consistency checking

### AI Applications in This Project

#### Code Generation
- Generated TypeScript service interfaces and implementations
- Created Express middleware for tenant extraction and rate limiting
- Produced Redis caching layer abstractions
- Generated Elasticsearch query builders with tenant filters

#### Architecture Documentation
- Reviewed and refined architectural diagrams
- Enhanced production readiness analysis with operational details
- Verified multi-tenancy isolation strategies
- Ensured consistency across documentation

#### Documentation Creation
- Generated comprehensive API examples with curl commands
- Created detailed operational runbooks
- Produced SLA analysis frameworks
- Enhanced error handling documentation

#### Quality Assurance
- Reviewed code for security vulnerabilities
- Validated architectural decisions against best practices
- Ensured documentation accuracy and completeness
- Cross-checked multi-tenancy implementation

### AI Tool Leverage Summary
- **Code Quality**: Improved through AI-assisted refactoring suggestions
- **Documentation**: Comprehensive through AI-generated examples and patterns
- **Architecture**: Validated through AI analysis of design trade-offs
- **Consistency**: Maintained across all files through AI cross-referencing

---

## Architecture Design

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GLOBAL CONTROL PLANE                                │
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────────┐    │
│  │  Global DNS/LB   │    │   POD Registry   │    │  Tenant Allocation │    │
│  │  (Route53/CF)    │    │   & Health       │    │  Service           │    │
│  └────────┬─────────┘    └──────────────────┘    └────────────────────┘    │
└───────────┼──────────────────────────────────────────────────────────────────┘
            │
    ┌───────┼───────────────────────┐
    ▼       ▼                       ▼
POD: US    POD: EU                POD: APAC
[Details in ARCHITECTURE.md]
```

### Multi-Tenancy Approach

**Decision: Single Index Per POD**

All tenants within a geographic region (POD) share a single Elasticsearch index with tenant isolation enforced at the query layer.

```
Elasticsearch Index: documents
├── Tenant A (filtered by query)
├── Tenant B (filtered by query)
└── Tenant C (filtered by query)

Query Filter: { term: { tenant_id: tenantId } } [MANDATORY]
```

**Defense-in-Depth Layers:**
- **L1 Middleware**: Extract and validate tenant from request
- **L2 Query Builder**: Inject tenant filter into ALL queries
- **L3 Elasticsearch Alias**: Filtered alias per tenant (optional)
- **L4 Audit Logging**: Log all queries with tenant context

### Data Flow: Document Indexing

```
User submits document → API validates → Redis queue → Async worker
                                           ↓
                    Extract content → Elasticsearch index
                                           ↓
                    Cache invalidation → Response to user
```

### Data Flow: Search Query

```
User search → Tenant validation → Rate limit check
    ↓              ↓                   ↓
Query builder → Cache check → ES query (with tenant filter)
    ↓              ↓                   ↓
Response build → Cache store → Return results
```

### Caching Strategy

**Multi-Level Caching:**
1. **HTTP Cache**: Client/CDN level (Cache-Control headers)
2. **Redis Cache**: Distributed cache (5-10 min TTL)
3. **Elasticsearch Cache**: Query/filter cache

**Cache TTL Configuration:**
- Search results: 5 min
- Documents: 10 min
- Job status: 30 min
- Rate limit counters: 1 min window
- JWT validation: 5 min

### Authentication & Authorization

**API Key + JWT Model:**
- **Primary**: API Keys (dds_tenant_xxx format)
- **Secondary**: JWT tokens for sessions (15 min lifetime)

**Permission Matrix:**
| Role | Read | Write | Delete | Search | Bulk | Admin |
|------|------|-------|--------|--------|------|-------|
| Viewer | ✓ | - | - | ✓ | - | - |
| Editor | ✓ | ✓ | - | ✓ | - | - |
| Manager | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Rate Limiting: Sliding Window Algorithm

```
Timeline:
├─────────────────┼─────────────────┼─────────────────┤
│  Previous Window │  Current Window │     Future      │
│    (60 sec)      │    (60 sec)     │                 │
├─────────────────┼─────────────────┼─────────────────┤
     45 requests       30 requests
                            ↑ Current time (25% into window)

Weighted Count = (45 × 0.75) + 30 = 63.75 requests
Limit = 100 → ALLOWED
```

**Per-API Rate Limits by Tier:**
| Operation | Free | Standard | Enterprise |
|-----------|------|----------|------------|
| Search | 10/min | 100/min | 1000/min |
| Index | 5/min | 50/min | 500/min |
| Bulk | 1/min | 10/min | 100/min |
| Get | 20/min | 200/min | 2000/min |
| Delete | 5/min | 30/min | 300/min |

---

## Production Readiness

### 1. Scalability for 100x Growth

**Current Baseline:**
- Single Elasticsearch node: ~1M documents
- Single API instance: ~500 req/s
- Single Redis: ~100K ops/s

**100x Growth Strategy:**

**Elasticsearch:**
- 30+ data nodes with hot-warm-cold architecture
- 10-15 primary shards per large tenant
- Time-based indices (documents_tenant_2024-01)
- Index Lifecycle Management (ILM) policies
- Dedicated coordinator and master nodes

**API Layer:**
- Kubernetes HPA (min 3, max 50 replicas)
- CPU target: 70% utilization
- Connection pooling (50 ES, 20 DB, 10 Redis connections)
- Stateless design for easy scaling

**Redis:**
- 6+ node cluster (3 master, 3 replica)
- Hash slot distribution for data partitioning
- Automatic failover
- LRU eviction policy

**Database:**
- PostgreSQL read replicas (1 primary + 2 replicas)
- pgBouncer for connection pooling
- Partitioning on audit_log by date

### 2. Resilience & Failover

**Circuit Breakers:**
```
Failed Requests: 5 → Open circuit
Success Required: 3 → Close circuit
Reset Timeout: 60 seconds
Fallback: Cached results or degraded response
```

**Retry Strategies:**
- Elasticsearch: 3 retries, exponential backoff (100ms, 200ms, 400ms)
- Redis: 2 retries, linear backoff (50ms, 100ms)
- PostgreSQL: 3 retries, exponential backoff

**Graceful Degradation:**
- Redis Down: Skip caching, fallback to IP-based rate limiting
- PostgreSQL Down: Search continues, audit logs queued
- Elasticsearch Degraded: Serve from cache, queue writes
- Network Partition: Open circuit, return cached responses

### 3. Security Architecture

**Encryption at Rest:**
- Elasticsearch: AES-256-GCM (KMS managed)
- PostgreSQL: TDE (AES-256, KMS managed)
- Redis: Encrypted RDB/AOF (KMS managed)
- Backups: AES-256 (separate KMS key)

**Encryption in Transit:**
- Client → LB: TLS 1.3
- Internal Services: mTLS
- Certificate rotation: Automatic via cert-manager

**Tenant Isolation:**
- Mandatory tenant ID on every request
- Query-layer filtering enforcement
- Row-level security in PostgreSQL
- Cross-tenant access prevention in tests

### 4. Observability

**Metrics (Prometheus):**
- HTTP requests (method, path, status, tenant)
- Search latency (percentiles)
- Elasticsearch health (nodes, docs)
- Redis connections and operations
- Business metrics (documents indexed, deleted)

**Logging (ELK Stack):**
- Structured JSON logs with requestId, tenantId, duration
- ERROR: Failures requiring investigation
- WARN: Degraded performance, near-limits
- INFO: Normal operations and requests
- DEBUG: Detailed debugging (disabled in prod)

**Distributed Tracing (Jaeger/OpenTelemetry):**
- Trace each request through all services
- Measure component latencies
- Identify performance bottlenecks

**Alerting Rules:**
- High error rate > 1% for 5min (Critical)
- Slow searches (p95 > 500ms) (Warning)
- Elasticsearch down (Critical)
- High disk usage > 85% (Warning)

### 5. Performance Optimization

**Elasticsearch Settings:**
- refresh_interval: 1s (balance freshness vs performance)
- number_of_shards: 3 (based on data volume)
- number_of_replicas: 1 (HA without over-replication)
- Custom analyzers for better tokenization
- Disable _source for large fields

**Query Optimization:**
- Use filter context for non-scoring queries
- Avoid wildcard queries on text fields
- search_after for deep pagination
- 30-second query timeout enforcement

**Index Lifecycle Policy:**
- Hot: Fresh data (0-30 days)
- Warm: Archive (30-90 days)
- Cold: Freeze (90-365 days)
- Delete: After 365 days

### 6. Operations

**Blue-Green Deployment:**
```
Blue (Current) 100% traffic
Green (New) 0% traffic
    ↓
Shift 5% → 25% → 50% → 100%
Monitor error rates and latency
Automatic rollback on anomalies
```

**Zero-Downtime Database Updates:**
1. Add new columns as nullable
2. Deploy app reading both old/new
3. Backfill data in batches
4. Deploy app using new schema
5. Remove old columns in separate migration

**Backup/Recovery:**

| Component | Frequency | Retention | RTO | RPO |
|-----------|-----------|-----------|-----|-----|
| Elasticsearch | Every 6h | 30 days | 4h | 6h |
| PostgreSQL | Continuous | 30 days | 15min | ~0 |
| Redis | Every 1h | 7 days | 30min | 1h |

**Disaster Recovery:**
- Single POD failure: Restore from snapshots (4 hours, 6hr RPO)
- Node failure: Automatic failover via clustering
- Region failure: Not supported (data residency requirement)

### 7. SLA & Service Tiers

**Target: 99.95% Availability**
- Maximum 21.9 minutes downtime per month
- Multi-AZ deployment with auto-scaling
- 3-node Elasticsearch cluster
- Redis Sentinel for HA
- PostgreSQL streaming replication

**Service Tier SLAs:**

| Tier | Availability | Response Time (p95) | Rate Limit (Search) |
|------|--------------|---------------------|---------------------|
| Free | 99.0% | 1000ms | 10 req/min |
| Standard | 99.9% | 500ms | 100 req/min |
| Enterprise | 99.95% | 200ms | 1000 req/min |

---

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Git

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/ashwini-k-pandey/distributed-document-search.git
cd distributed-document-search

# 2. Start services
docker-compose up -d

# 3. Verify health
curl http://localhost:3000/health

# 4. Create a document
curl -X POST http://localhost:3000/documents \
  -H "X-Tenant-ID: acme-corp" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API Guide",
    "content": "Getting started with the Distributed Document Search API"
  }'

# 5. Search
curl -X GET "http://localhost:3000/search?q=API" \
  -H "X-Tenant-ID: acme-corp"
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/documents` | Create/index a document |
| POST | `/documents/bulk` | Bulk index documents |
| GET | `/documents/{id}` | Get document by ID |
| DELETE | `/documents/{id}` | Delete document |
| GET | `/search?q={query}` | Search documents |
| POST | `/search` | Advanced search |
| GET | `/jobs/{jobId}` | Get job status |
| GET | `/health` | Health check |
| GET | `/health/ready` | Readiness probe |
| GET | `/health/detailed` | Detailed status |
| GET | `/metrics` | Prometheus metrics |

### Example Workflows

**Workflow 1: Index and Search**
```bash
# Create document
DOC_ID=$(curl -s -X POST http://localhost:3000/documents \
  -H "X-Tenant-ID: acme-corp" \
  -H "Content-Type: application/json" \
  -d '{"title":"Guide","content":"API reference"}' \
  | jq -r '.data.documentId')

# Search
curl -X GET "http://localhost:3000/search?q=API" \
  -H "X-Tenant-ID: acme-corp"

# Get by ID
curl -X GET "http://localhost:3000/documents/$DOC_ID" \
  -H "X-Tenant-ID: acme-corp"
```

**Workflow 2: Multi-Tenant Isolation**
```bash
# Create in tenant A
curl -X POST http://localhost:3000/documents \
  -H "X-Tenant-ID: tenant-a" \
  -H "Content-Type: application/json" \
  -d '{"title":"A-Doc","content":"Content A"}'

# Create in tenant B
curl -X POST http://localhost:3000/documents \
  -H "X-Tenant-ID: tenant-b" \
  -H "Content-Type: application/json" \
  -d '{"title":"B-Doc","content":"Content B"}'

# Search in tenant A (only sees A's documents)
curl -X GET "http://localhost:3000/search?q=Doc" \
  -H "X-Tenant-ID: tenant-a"
```
