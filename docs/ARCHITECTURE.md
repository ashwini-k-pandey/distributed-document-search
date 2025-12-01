# Distributed Document Search Service - Architecture Design

## Related Documents

- [Architecture Decisions](./ARCHITECTURE_DECISIONS.md) - Detailed rationale for architectural choices
- [Production Readiness](./production_readiness.md) - **Single source of truth** for operational details: scalability, resilience, security, observability, performance tuning, operations, and SLA tiers
- [Multi-Tenancy Guide](./MULTI_TENANCY_GUIDE.md) - Tenant isolation and management

---

## 1. High-Level System Architecture

The system uses a **Regional POD Architecture** where each geographic region operates as an independent, self-contained deployment (POD). A global control plane manages tenant routing and POD allocation.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              GLOBAL CONTROL PLANE                                │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐   │
│  │   Global DNS/LB  │    │   POD Registry   │    │  Tenant → POD Mapping    │   │
│  │  (Route53/CF)    │    │   & Health       │    │  Service                 │   │
│  └────────┬─────────┘    └──────────────────┘    └──────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────────────────────────┘
            │
            ├─────────────────────────────┬─────────────────────────────┐
            ▼                             ▼                             ▼
┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
│    POD: US-EAST       │   │    POD: EU-WEST       │   │    POD: APAC          │
│  ┌─────────────────┐  │   │  ┌─────────────────┐  │   │  ┌─────────────────┐  │
│  │  Load Balancer  │  │   │  │  Load Balancer  │  │   │  │  Load Balancer  │  │
│  │  (SSL + Health) │  │   │  │  (SSL + Health) │  │   │  │  (SSL + Health) │  │
│  └────────┬────────┘  │   │  └────────┬────────┘  │   │  └────────┬────────┘  │
│           │           │   │           │           │   │           │           │
│  ┌────────▼────────┐  │   │  ┌────────▼────────┐  │   │  ┌────────▼────────┐  │
│  │   API Gateway   │  │   │  │   API Gateway   │  │   │  │   API Gateway   │  │
│  │   (3-10 pods)   │  │   │  │   (3-10 pods)   │  │   │  │   (3-10 pods)   │  │
│  └────────┬────────┘  │   │  └────────┬────────┘  │   │  └────────┬────────┘  │
│           │           │   │           │           │   │           │           │
│  ┌────────▼────────┐  │   │  ┌────────▼────────┐  │   │  ┌────────▼────────┐  │
│  │  Redis Cluster  │  │   │  │  Redis Cluster  │  │   │  │  Redis Cluster  │  │
│  │ (Cache + Rate)  │  │   │  │ (Cache + Rate)  │  │   │  │ (Cache + Rate)  │  │
│  └────────┬────────┘  │   │  └────────┬────────┘  │   │  └────────┬────────┘  │
│           │           │   │           │           │   │           │           │
│  ┌────────▼────────┐  │   │  ┌────────▼────────┐  │   │  ┌────────▼────────┐  │
│  │ Elasticsearch   │  │   │  │ Elasticsearch   │  │   │  │ Elasticsearch   │  │
│  │ (Single Index)  │  │   │  │ (Single Index)  │  │   │  │ (Single Index)  │  │
│  └────────┬────────┘  │   │  └────────┬────────┘  │   │  └────────┬────────┘  │
│           │           │   │           │           │   │           │           │
│  ┌────────▼────────┐  │   │  ┌────────▼────────┐  │   │  ┌────────▼────────┐  │
│  │   PostgreSQL    │  │   │  │   PostgreSQL    │  │   │  │   PostgreSQL    │  │
│  │   (Metadata)    │  │   │  │   (Metadata)    │  │   │  │   (Metadata)    │  │
│  └─────────────────┘  │   │  └─────────────────┘  │   │  └─────────────────┘  │
│                       │   │                       │   │                       │
│  Tenants: A, B, C...  │   │  Tenants: X, Y, Z...  │   │  Tenants: P, Q, R...  │
└───────────────────────┘   └───────────────────────┘   └───────────────────────┘
```

### POD Characteristics

| Aspect | Description |
|--------|-------------|
| **Independence** | Each POD operates independently with no cross-POD data sharing |
| **Data Residency** | Tenant data stays within the allocated POD region |
| **Failover** | PODs do not fail over to other regions (data residency compliance) |
| **Scaling** | Each POD scales independently based on load |

## 2. Data Flow Diagrams

### 2.1 Document Indexing Flow

```
┌──────────┐     ┌─────────┐     ┌────────────┐     ┌───────────────┐     ┌──────────────┐
│  Client  │────▶│   API   │────▶│ Validation │────▶│  PostgreSQL   │────▶│   Response   │
│          │     │ Gateway │     │ & Tenant   │     │ (Save Job +   │     │ (Accepted +  │
└──────────┘     └─────────┘     │ Extraction │     │  Metadata)    │     │  Job ID)     │
                                 └────────────┘     └───────┬───────┘     └──────────────┘
                                                            │
                                                            ▼
                                                    ┌───────────────┐
                                                    │ Message Queue │
                                                    │ (Index Job)   │
                                                    └───────┬───────┘
                                                            │
                        ┌───────────────────────────────────┼───────────────────────────────────┐
                        │                      ASYNC WORKER │                                   │
                        │                                   ▼                                   │
                        │                          ┌──────────────┐                             │
                        │                          │  URL Fetch   │                             │
                        │                          │  & SSRF      │                             │
                        │                          │  Prevention  │                             │
                        │                          └──────┬───────┘                             │
                        │                                 │                                     │
                        │                                 ▼                                     │
                        │                          ┌──────────────┐                             │
                        │                          │   Content    │                             │
                        │                          │  Extraction  │                             │
                        │                          │(PDF/HTML/TXT)│                             │
                        │                          └──────┬───────┘                             │
                        │                                 │                                     │
                        │        ┌────────────────────────┼────────────────────────┐            │
                        │        │                        │                        │            │
                        │        ▼                        ▼                        ▼            │
                        │ ┌─────────────┐         ┌─────────────┐          ┌───────────┐        │
                        │ │Elasticsearch│         │ PostgreSQL  │          │   Redis   │        │
                        │ │ (Index Doc) │         │(Update Job  │          │(Invalidate│        │
                        │ │             │         │   Status)   │          │  Cache)   │        │
                        │ └─────────────┘         └─────────────┘          └───────────┘        │
                        │                                                                       │
                        └───────────────────────────────────────────────────────────────────────┘
```

### 2.2 Search Query Flow

```
┌──────────┐     ┌─────────┐     ┌────────────┐     ┌────────────────┐
│  Client  │────▶│   API   │────▶│ Validation │────▶│  Rate Limiter  │
│          │     │ Gateway │     │ & Tenant   │     │  (Per-Tenant)  │
└──────────┘     └─────────┘     │ Extraction │     └───────┬────────┘
                                 └────────────┘             │
                                                            ▼
                                                 ┌────────────────────┐
                                                 │   Query Builder    │
                                                 │  - Parse user query│
                                                 │  - Inject tenant   │
                                                 │    filter (L1-L4)  │
                                                 │  - Build ES query  │
                                                 └─────────┬──────────┘
                                                           │
                                                           ▼
                                                 ┌────────────────────┐
                                                 │    Cache Check     │─────────────────┐
                                                 │ Key: {tenant}:     │                 │
                                                 │      {query_hash}  │                 │
                                                 └─────────┬──────────┘                 │
                                                           │                            │
                                                    Cache Miss                     Cache Hit
                                                           │                            │
                                                           ▼                            │
                                                 ┌────────────────────┐                 │
                                                 │   Elasticsearch    │                 │
                                                 │  (Search + Score   │                 │
                                                 │  + Highlight)      │                 │
                                                 └─────────┬──────────┘                 │
                                                           │                            │
                                                           ▼                            │
                                                 ┌────────────────────┐                 │
                                                 │    Cache Store     │                 │
                                                 │    (TTL: 5 min)    │                 │
                                                 └─────────┬──────────┘                 │
                                                           │                            │
                                                           ▼                            ▼
                                                 ┌───────────────────────────────────────┐
                                                 │             Audit Log                 │
                                                 │  (Tenant, Query, Results Count, Time) │
                                                 └───────────────────┬───────────────────┘
                                                                     │
                                                                     ▼
                                                 ┌───────────────────────────────────────┐
                                                 │              Response                 │
                                                 │  (Results + Pagination + Metrics)     │
                                                 └───────────────────────────────────────┘
```

## 3. Database/Storage Strategy

### 3.1 Elasticsearch (Primary Search Engine)

**Why Elasticsearch:**
- Native full-text search with relevance scoring (BM25 algorithm)
- Sub-millisecond query latency at scale
- Horizontal scalability through sharding
- Rich query DSL supporting fuzzy matching, faceted search, highlighting
- Built-in distributed architecture

**Index Strategy:**
- **Single index per POD**: All tenants share a `documents` index with tenant isolation enforced at the query layer
- **Shard configuration**: Configured for high availability with replicas
- **Index lifecycle management**: Hot-warm-cold architecture for cost optimization

> **Operational Details**: See [Production Readiness - Performance](./production_readiness.md#5-performance) for shard configuration, index settings, and optimization strategies.

### 3.2 Redis (Cache Layer)

**Deployment:** Redis Cluster for high availability within each POD.

**Use Cases:**

| Use Case | Description |
|----------|-------------|
| Search result caching | Cached ES query responses |
| Document caching | Individual document lookups |
| Job status caching | Async indexing job status for polling |
| Per-tenant rate limiting | Sliding window counters per operation |
| Distributed locking | Prevents concurrent operations on same resource |
| Token validation cache | Cached JWT validation results |

**Cache Key Strategy:**
```
search:{tenant_id}:{query_hash}       - Search results
doc:{tenant_id}:{document_id}         - Individual documents
job:{tenant_id}:{job_id}              - Indexing job status
lock:{tenant_id}:{resource}           - Distributed locks
ratelimit:{tenant_id}:{operation}     - Per-operation rate limits (search, index, bulk, get, delete)
token:{token_hash}                    - JWT validation cache
```

> **Operational Details**: See [Production Readiness - Scalability](./production_readiness.md#1-scalability) for cluster sizing, TTL configurations, and eviction policies.

### 3.3 PostgreSQL (Metadata Store)

**Purpose:**
- Tenant configuration and management
- API key storage and authentication
- Document metadata (file size, MIME type, source)
- Audit logging for compliance
- Relational queries not suited for Elasticsearch

## 4. API Design

### 4.1 RESTful Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/documents` | Submit document URL for indexing (async) |
| POST | `/documents/bulk` | Bulk submit URLs (max 100, async) |
| GET | `/documents/{id}` | Get document by ID |
| DELETE | `/documents/{id}` | Delete a document |
| GET | `/jobs/{id}` | Get indexing job status |
| GET | `/search` | Search documents |
| POST | `/search` | Search with complex query |
| GET | `/health` | Basic health check |
| GET | `/health/ready` | Readiness probe |
| GET | `/health/detailed` | Full status with deps |
| GET | `/health/metrics` | Prometheus metrics |

### 4.2 API Contract Examples

**Submit Document for Indexing:**
```bash
POST /documents
X-Tenant-ID: acme-corp
Content-Type: application/json

{
  "url": "https://example.com/docs/api-guidelines.pdf",
  "title": "API Design Guidelines",
  "tags": ["engineering", "api", "guidelines"],
  "metadata": {
    "author": "John Doe",
    "department": "Engineering"
  }
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_7f3d8a2b-1c4e-5f6a-9b8c-0d1e2f3a4b5c",
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Check Job Status:**
```bash
GET /jobs/job_7f3d8a2b-1c4e-5f6a-9b8c-0d1e2f3a4b5c
X-Tenant-ID: acme-corp
```

**Response (Job Completed):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_7f3d8a2b-1c4e-5f6a-9b8c-0d1e2f3a4b5c",
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "createdAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:30:05Z"
  }
}
```

**Response (Job Failed):**
```json
{
  "success": false,
  "data": {
    "jobId": "job_7f3d8a2b-1c4e-5f6a-9b8c-0d1e2f3a4b5c",
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "failed",
    "error": {
      "code": "FETCH_FAILED",
      "message": "Unable to fetch document from URL: connection timeout"
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "failedAt": "2024-01-15T10:30:12Z"
  }
}
```

**Search Documents:**
```bash
GET /search?q=API+design&page=1&limit=20&highlight=true&fuzzy=true
X-Tenant-ID: acme-corp
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hits": [
      {
        "document": {
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "title": "API Design Guidelines",
          "content": "...",
          "tags": ["engineering", "api"],
          "createdAt": "2024-01-15T10:30:00Z"
        },
        "score": 12.5,
        "highlights": {
          "title": ["<mark>API</mark> <mark>Design</mark> Guidelines"],
          "content": ["best practices for REST <mark>API</mark> <mark>design</mark>..."]
        }
      }
    ],
    "pagination": {
      "total": 156,
      "page": 1,
      "limit": 20,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    },
    "meta": {
      "took": 45,
      "cached": false,
      "query": "API design"
    }
  }
}
```

## 5. Consistency Model and Trade-offs

### 5.1 Consistency Choices

| Component | Consistency Model | Trade-off |
|-----------|-------------------|-----------|
| Elasticsearch | Eventually Consistent | Prioritize availability and performance over strict consistency. Documents become searchable within ~1 second (configurable refresh interval). |
| PostgreSQL | Strong Consistency | ACID transactions for tenant config, audit logs, and critical metadata. |
| Redis Cache | Best Effort | Cache invalidation on writes; stale reads acceptable for search results. |

### 5.2 CAP Theorem Trade-offs

Our system prioritizes **Availability** and **Partition Tolerance** (AP) for search operations:
- Search remains available during network partitions
- Eventual consistency acceptable for document indexing
- Strong consistency required only for:
  - Tenant configuration changes
  - API key management
  - Billing/usage tracking

## 6. Caching Strategy

### 6.1 Multi-Level Caching

```
┌─────────────────┐
│  HTTP Cache     │  ← Cache-Control headers for clients
│  (CDN/Browser)  │
└────────┬────────┘
         │
┌────────▼────────┐
│  Redis Cache    │  ← Distributed cache for API layer
│  (5-10 min TTL) │
└────────┬────────┘
         │
┌────────▼────────┐
│  Elasticsearch  │  ← Query cache & filter cache
│  Internal Cache │
└─────────────────┘
```

### 6.2 Cache Invalidation Strategy

- **Write-through**: Document create/update invalidates related caches
- **TTL-based expiration**: Prevents unbounded cache growth
- **Tenant-scoped invalidation**: Changes to tenant data invalidate only that tenant's cache
- **Pattern-based deletion**: `search:{tenant_id}:*` for broad invalidation

## 7. Message Queue Usage

### 7.1 Asynchronous Operations

| Queue | Purpose | Consumers |
|-------|---------|-----------|
| `document-index` | Async document indexing | Index workers |
| `bulk-operations` | Large batch processing | Bulk processors |
| `audit-events` | Audit log processing | Audit workers |
| `notifications` | Webhook delivery | Notification workers |

### 7.2 Benefits

- Decouples write path from indexing
- Enables retry logic for failed operations
- Provides backpressure handling during traffic spikes
- Supports event-driven architectures

## 8. Multi-Tenancy Approach

### 8.1 Data Isolation Strategy: Single Index Per POD

All tenants within a POD share a **single Elasticsearch index** with tenant isolation enforced at the query layer.

```
┌───────────────────────────────────────────────────────────────┐
│                    POD: US-EAST                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Elasticsearch Index: documents             │  │
│  │                                                         │  │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐             │  │
│  │  │ Tenant A  │ │ Tenant B  │ │ Tenant C  │             │  │
│  │  │ Documents │ │ Documents │ │ Documents │             │  │
│  │  │ (filtered)│ │ (filtered)│ │ (filtered)│             │  │
│  │  └───────────┘ └───────────┘ └───────────┘             │  │
│  │                                                         │  │
│  │  Index Mapping:                                         │  │
│  │  - tenant_id (keyword, required)                        │  │
│  │  - document_url (keyword)                               │  │
│  │  - title (text + keyword)                               │  │
│  │  - content (text, analyzed)                             │  │
│  │  - content_hash (keyword) - for deduplication           │  │
│  │  - metadata (object)                                    │  │
│  │  - indexed_at (date)                                    │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**Why Single Index per POD (vs Per-Tenant Index):**

| Aspect | Single Index (Chosen) | Per-Tenant Index |
|--------|----------------------|------------------|
| **Index count** | 1 per POD | N per POD (1 per tenant) |
| **Operational simplicity** | High | Low (many indices to manage) |
| **Resource efficiency** | High (shared shards) | Lower (shard overhead per tenant) |
| **Query isolation** | Query-level filtering | Physical separation |
| **Tenant deletion** | Delete by query | Drop index |

### 8.2 Tenant Isolation Enforcement

All queries **MUST** include a mandatory tenant filter:

```typescript
const searchQuery = {
  query: {
    bool: {
      filter: [
        { term: { tenant_id: tenantId } }  // MANDATORY
      ],
      must: [
        { match: { content: userQuery } }
      ]
    }
  }
};
```

**Defense-in-Depth Layers:**

| Layer | Mechanism | Description |
|-------|-----------|-------------|
| L1 | Middleware | Extract and validate tenant from request |
| L2 | Query Builder | Inject tenant filter into ALL queries |
| L3 | Elasticsearch Alias | Filtered alias per tenant (optional) |
| L4 | Audit Logging | Log all queries with tenant context |

### 8.3 Tenant Identification

```
Priority:
1. X-Tenant-ID header (recommended)
2. ?tenant= query parameter
3. Path parameter (/tenants/{id}/...)
```

### 8.4 Tenant Allocation at Onboarding

When a new tenant is created, they are permanently allocated to a single POD. This allocation is immutable to ensure data residency compliance.

**Allocation Flow:**
```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Tenant     │────▶│  Global Control │────▶│  POD Assignment  │
│  Onboarding  │     │     Plane       │     │  (Immutable)     │
└──────────────┘     └─────────────────┘     └──────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ Allocation      │
                     │ Factors:        │
                     │ - Region pref   │
                     │ - Data residency│
                     │ - POD capacity  │
                     │ - Load balance  │
                     └─────────────────┘
```

**Allocation Rules:**

| Factor | Description |
|--------|-------------|
| Region Preference | Tenant specifies preferred region (e.g., EU for GDPR) |
| Data Residency | Legal requirements determine eligible PODs |
| POD Capacity | Avoid overloading; balance tenant count per POD |
| Load Balancing | Consider existing document volume and query load |

**Post-Allocation:**
- Tenant → POD mapping stored in Global Control Plane
- All API requests routed to assigned POD via global DNS
- Tenant data never leaves assigned POD
- Re-allocation requires manual data migration (not supported in v1)

### 8.5 Security Measures

- Tenant ID validation and sanitization
- Mandatory tenant filter injection in query layer
- Per-tenant rate limiting
- Audit logging of all operations
- API key scoped to tenant
- Integration tests verify tenant isolation (required for CI/CD)

---

## 9. Rate Limiting

### 9.1 Sliding Window Counter Algorithm

Rate limiting uses the **Sliding Window Counter** algorithm for balance between accuracy and memory efficiency.

```
Timeline:
├─────────────────┼─────────────────┼─────────────────┤
│  Previous Window │  Current Window │     Future      │
│    (60 sec)      │    (60 sec)     │                 │
├─────────────────┼─────────────────┼─────────────────┤
     45 requests       30 requests
                            ▲
                            │ Current time (25% into window)

Weighted Count = (Previous × (1 - elapsed%)) + Current
               = (45 × 0.75) + 30
               = 63.75 requests

If limit = 100 requests/minute → ALLOWED (63.75 < 100)
```

### 9.2 Per-API Rate Limits

Rate limits are applied per-tenant and vary by subscription tier (Free, Standard, Enterprise). Each API operation (search, index, bulk, get, delete) has its own limit.

> **Operational Details**: See [Production Readiness - SLA Considerations](./production_readiness.md#7-sla-considerations) for specific rate limit values by tier.

### 9.3 Rate Limit Response Headers

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 37
X-RateLimit-Reset: 1701234627
X-RateLimit-Operation: search

# On rate limit exceeded
HTTP/1.1 429 Too Many Requests
Retry-After: 23
```

---

## 10. Document Handling Strategy

### 10.1 URL-Based Document Reference

The system does **NOT** store document content. Users provide document URLs, and the system:

1. Fetches content from the URL for indexing
2. Stores only the URL reference and extracted metadata
3. Returns the URL for users to access the original document

```
┌──────────────┐
│    Client    │
│   Request    │
└──────┬───────┘
       │  POST /documents
       │  { "url": "https://example.com/doc.pdf", "title": "Report" }
       ▼
┌──────────────┐     ┌────────────────────────────────────┐
│   Fetch      │     │  Supported URL Schemes:            │
│   Document   │────▶│  - https:// (required)             │
│   Content    │     │  - s3:// (with credentials)        │
└──────┬───────┘     │  - gs:// (with credentials)        │
       │             └────────────────────────────────────┘
       ▼
┌──────────────┐     ┌────────────────────────────────────┐
│   Extract    │     │  Extraction:                       │
│   Content    │────▶│  - PDF: text extraction            │
└──────┬───────┘     │  - HTML: strip tags, get text      │
       │             │  - TXT/MD: direct content          │
       ▼             └────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│                 INDEX TO ELASTICSEARCH                     │
│  {                                                         │
│    "tenant_id": "acme",                                    │
│    "document_id": "doc_abc123",                            │
│    "document_url": "https://example.com/doc.pdf",          │
│    "title": "Report",                                      │
│    "content": "<extracted text for search>",               │
│    "content_hash": "sha256:...",  // Deduplication         │
│    "indexed_at": "2024-01-20T14:25:00Z"                    │
│  }                                                         │
│  Note: Original document NOT stored                        │
└────────────────────────────────────────────────────────────┘
```

### 10.2 SSRF Prevention

Fetching user-provided URLs requires protection against Server-Side Request Forgery:

| Check | Purpose |
|-------|---------|
| Scheme validation | Only allow https, s3, gs |
| DNS resolution check | Resolve hostname before fetch |
| IP range validation | Block private/internal IPs (10.x, 172.16.x, 192.168.x, 169.254.x) |
| Post-redirect validation | Re-validate after each redirect |
| Cloud metadata blocking | Block 169.254.169.254 explicitly |

---

## 11. Authentication & Authorization

### 11.1 API Key + JWT Token Model

```
┌─────────────────┐             ┌─────────────────┐
│   API Key Auth  │             │   JWT Token     │
│   (Primary)     │             │   (Session)     │
└────────┬────────┘             └────────┬────────┘
         │  Authorization:               │  Authorization:
         │  ApiKey <key>                 │  Bearer <jwt>
         ▼                               ▼
┌─────────────────────────────────────────────────────────┐
│                    API Gateway                          │
│  1. Extract credentials from header                     │
│  2. Validate API key OR verify JWT                      │
│  3. Load tenant context                                 │
│  4. Check permissions                                   │
│  5. Apply rate limits                                   │
└─────────────────────────────────────────────────────────┘
```

### 11.2 API Key Format

```
Format: dds_{tenant_prefix}_{random_string}
Example: dds_acme_a1b2c3d4e5f6g7h8i9j0

Components:
- dds_       : Service prefix (Distributed Document Search)
- acme_      : Tenant identifier prefix
- a1b2c3...  : 20-character random string (base62)
```

### 11.3 Permission Matrix

| Role | documents:read | documents:write | documents:delete | search | bulk | admin |
|------|----------------|-----------------|------------------|--------|------|-------|
| Viewer | Yes | - | - | Yes | - | - |
| Editor | Yes | Yes | - | Yes | - | - |
| Manager | Yes | Yes | Yes | Yes | Yes | - |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes |

---

## 12. Data Encryption

### 12.1 Encryption Architecture

```
                    ENCRYPTION IN TRANSIT
┌─────────────────────────────────────────────────────────────┐
│  Client ◄──── TLS 1.3 ────► Load Balancer ◄── TLS 1.3 ──► API │
│  API ◄──────── mTLS ────────► Elasticsearch                 │
│  API ◄──────── mTLS ────────► PostgreSQL                    │
│  API ◄──────── mTLS ────────► Redis                         │
└─────────────────────────────────────────────────────────────┘

                    ENCRYPTION AT REST
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  Elasticsearch  │  │   PostgreSQL    │  │    Redis    │  │
│  │  AES-256 index  │  │  TDE (AES-256)  │  │  AES-256    │  │
│  │  KMS managed    │  │  KMS managed    │  │  KMS managed│  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 Encryption Standards

- **In Transit**: TLS 1.3 for external connections, mTLS for internal service communication
- **At Rest**: AES-256 encryption for all data stores (Elasticsearch, PostgreSQL, Redis, Backups)
- **Key Management**: Cloud KMS with automatic key rotation

> **Operational Details**: See [Production Readiness - Security](./production_readiness.md#3-security) for detailed encryption configuration and certificate management.

---

## 13. Architecture Decision Log

| # | Decision | Rationale | Section |
|---|----------|-----------|---------|
| 1 | Single index per POD | Operational simplicity, resource efficiency | 8.1 |
| 2 | Multi-region PODs | Data residency, latency optimization | 1 |
| 3 | Tenant allocation at onboarding | Stable routing, compliance, data residency | 8.4 |
| 4 | Sliding window rate limiting | Balance of accuracy and memory efficiency | 9.1 |
| 5 | Per-API rate limits | Granular resource control | 9.2 |
| 6 | URL-based documents | Reduced storage costs, user owns data | 10.1 |
| 7 | API key + JWT auth | Flexible authentication options | 11.1 |
| 8 | TLS 1.3 + AES-256 | Industry standard security | 12 |
| 9 | Async document indexing | Reliability for external URL fetching, non-blocking API | 2.1, 4.2 |
| 10 | Redis Cluster (3m+3r) | High availability, fault tolerance within POD | 3.2 |


---

*Document Version: 2.1*
*Last Updated: 2025-12*
