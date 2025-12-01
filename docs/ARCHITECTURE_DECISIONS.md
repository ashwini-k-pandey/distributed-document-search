# Architecture Decisions

This document captures the key architectural decisions for the Distributed Document Search system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Multi-Tenancy Architecture](#multi-tenancy-architecture)
3. [Regional POD Architecture](#regional-pod-architecture)
4. [Tenant Onboarding & POD Allocation](#tenant-onboarding--pod-allocation)
5. [Resource Governance & Rate Limiting](#resource-governance--rate-limiting)
6. [Document Handling Strategy](#document-handling-strategy)
7. [Authentication & Authorization](#authentication--authorization)
8. [Data Encryption](#data-encryption)

---

## System Overview

```
                                    ┌─────────────────────────────────────────────────┐
                                    │              GLOBAL LAYER                        │
                                    │  ┌─────────────┐    ┌──────────────────────┐    │
                                    │  │   Global    │    │   Tenant Registry    │    │
                                    │  │   DNS/LB    │    │   & POD Allocation   │    │
                                    │  └──────┬──────┘    └──────────────────────┘    │
                                    └─────────┼───────────────────────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│       POD: US-EAST      │   │       POD: EU-WEST      │   │       POD: APAC         │
│  ┌───────────────────┐  │   │  ┌───────────────────┐  │   │  ┌───────────────────┐  │
│  │    API Gateway    │  │   │  │    API Gateway    │  │   │  │    API Gateway    │  │
│  └─────────┬─────────┘  │   │  └─────────┬─────────┘  │   │  └─────────┬─────────┘  │
│            │            │   │            │            │   │            │            │
│  ┌─────────▼─────────┐  │   │  ┌─────────▼─────────┐  │   │  ┌─────────▼─────────┐  │
│  │   Redis Cluster   │  │   │  │   Redis Cluster   │  │   │  │   Redis Cluster   │  │
│  │  (Cache + Rate)   │  │   │  │  (Cache + Rate)   │  │   │  │  (Cache + Rate)   │  │
│  └─────────┬─────────┘  │   │  └─────────┬─────────┘  │   │  └─────────┬─────────┘  │
│            │            │   │            │            │   │            │            │
│  ┌─────────▼─────────┐  │   │  ┌─────────▼─────────┐  │   │  ┌─────────▼─────────┐  │
│  │  Elasticsearch    │  │   │  │  Elasticsearch    │  │   │  │  Elasticsearch    │  │
│  │  (Single Index)   │  │   │  │  (Single Index)   │  │   │  │  (Single Index)   │  │
│  └─────────┬─────────┘  │   │  └─────────┬─────────┘  │   │  └─────────┬─────────┘  │
│            │            │   │            │            │   │            │            │
│  ┌─────────▼─────────┐  │   │  ┌─────────▼─────────┐  │   │  ┌─────────▼─────────┐  │
│  │    PostgreSQL     │  │   │  │    PostgreSQL     │  │   │  │    PostgreSQL     │  │
│  │    (Metadata)     │  │   │  │    (Metadata)     │  │   │  │    (Metadata)     │  │
│  └───────────────────┘  │   │  └───────────────────┘  │   │  └───────────────────┘  │
│                         │   │                         │   │                         │
│  Tenants: A, B, C, ...  │   │  Tenants: X, Y, Z, ...  │   │  Tenants: P, Q, R, ...  │
└─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

---

## Multi-Tenancy Architecture

### Decision: Single Index Per POD

We adopt the **Single Index in POD** approach where all tenants within a POD share a single Elasticsearch index with tenant isolation enforced at the query layer.

```
┌─────────────────────────────────────────────────────────────┐
│                    POD: US-EAST                             │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Elasticsearch Index: documents            │  │
│  │                                                       │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │  Tenant A   │ │  Tenant B   │ │  Tenant C   │     │  │
│  │  │  Documents  │ │  Documents  │ │  Documents  │     │  │
│  │  │  (filtered) │ │  (filtered) │ │  (filtered) │     │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘     │  │
│  │                                                       │  │
│  │  Index Mapping:                                       │  │
│  │  - tenant_id (keyword, required)                      │  │
│  │  - document_url (keyword)                             │  │
│  │  - title (text + keyword)                             │  │
│  │  - content (text, analyzed)                           │  │
│  │  - metadata (object)                                  │  │
│  │  - indexed_at (date)                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Index Strategy Comparison

| Aspect | Single Index (Chosen) | Per-Tenant Index |
|--------|----------------------|------------------|
| **Index count** | 1 per POD | N per POD (1 per tenant) |
| **Operational simplicity** | High | Low (many indices to manage) |
| **Resource efficiency** | High (shared shards) | Lower (shard overhead per tenant) |
| **Query isolation** | Query-level filtering | Physical separation |
| **Tenant deletion** | Delete by query | Drop index |
| **Scaling** | Vertical + horizontal | Per-tenant scaling |
| **Cross-tenant risk** | Query bugs could leak | Complete isolation |

### Tenant Isolation Enforcement

All queries MUST include a mandatory tenant filter:

```typescript
// Query Structure - ALWAYS includes tenant_id filter
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

---

## Regional POD Architecture

### Decision: Multi-Region POD Deployment

The system is deployed across multiple geographic regions, with each region containing an independent POD.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           GLOBAL CONTROL PLANE                                │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────────┐  │
│  │  Global DNS    │  │  POD Registry  │  │  Tenant → POD Mapping Service  │  │
│  │  (Route 53/    │  │  (Active PODs  │  │  (Stores allocation decisions) │  │
│  │   CloudFlare)  │  │   & Health)    │  │                                │  │
│  └────────────────┘  └────────────────┘  └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│   POD: US-EAST    │     │   POD: EU-WEST    │     │   POD: APAC       │
│   Region: us-e-1  │     │   Region: eu-w-1  │     │   Region: ap-se-1 │
│   Status: Active  │     │   Status: Active  │     │   Status: Active  │
│   Tenants: 150    │     │   Tenants: 120    │     │   Tenants: 80     │
│   Capacity: 85%   │     │   Capacity: 70%   │     │   Capacity: 50%   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

### POD Components

Each POD is a self-contained deployment with:

| Component | Purpose | Configuration |
|-----------|---------|---------------|
| **API Gateway** | Request routing, auth, rate limiting | 3-10 replicas, auto-scaled |
| **Redis Cluster** | Caching, rate limit counters | 6 nodes (3 master, 3 replica) |
| **Elasticsearch** | Document search (single index) | 3+ data nodes, 3 master nodes |
| **PostgreSQL** | Tenant metadata, audit logs | Primary + replica |
| **Message Queue** | Async processing (optional) | RabbitMQ or SQS |

### POD Characteristics

- **Independence**: Each POD operates independently with no cross-POD data sharing
- **Data Residency**: Tenant data stays within the allocated POD region
- **Failover**: PODs do not fail over to other regions (data residency compliance)
- **Scaling**: Each POD scales independently based on load

---

## Tenant Onboarding & POD Allocation

### Decision: Allocation at Onboarding Time

Tenants are permanently allocated to a POD during the onboarding process. This allocation is based on:

1. **Geographic Preference**: Tenant's primary user location
2. **Data Residency Requirements**: Compliance requirements (GDPR, etc.)
3. **POD Capacity**: Current utilization and available capacity
4. **Service Tier**: Enterprise tenants may get dedicated resources

### Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TENANT ONBOARDING FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │   Tenant     │
     │   Sign-up    │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐      ┌─────────────────────────────────────────┐
     │   Collect    │      │  Required Information:                  │
     │   Details    │─────▶│  - Organization name                    │
     └──────┬───────┘      │  - Primary region preference            │
            │              │  - Data residency requirements          │
            │              │  - Expected usage tier                  │
            │              └─────────────────────────────────────────┘
            ▼
     ┌──────────────┐      ┌─────────────────────────────────────────┐
     │   POD        │      │  Allocation Algorithm:                  │
     │   Selection  │─────▶│  1. Filter by data residency rules      │
     └──────┬───────┘      │  2. Score by geographic proximity       │
            │              │  3. Check capacity constraints          │
            │              │  4. Apply service tier preferences      │
            │              └─────────────────────────────────────────┘
            ▼
     ┌──────────────┐
     │   Create     │
     │   Tenant     │
     │   Record     │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐      ┌─────────────────────────────────────────┐
     │   Generate   │      │  Credentials Generated:                 │
     │   API Keys   │─────▶│  - Primary API key                      │
     └──────┬───────┘      │  - Tenant ID                            │
            │              │  - POD endpoint URL                     │
            │              └─────────────────────────────────────────┘
            ▼
     ┌──────────────┐
     │   Tenant     │
     │   Active     │
     └──────────────┘
```

### Tenant Registry Schema

```sql
-- Global Tenant Registry (Control Plane)
CREATE TABLE tenant_registry (
    tenant_id           VARCHAR(64) PRIMARY KEY,
    organization_name   VARCHAR(255) NOT NULL,
    allocated_pod       VARCHAR(64) NOT NULL,
    pod_endpoint        VARCHAR(255) NOT NULL,
    data_residency      VARCHAR(32),
    service_tier        VARCHAR(32) DEFAULT 'standard',
    status              VARCHAR(32) DEFAULT 'active',
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- POD Registry (Control Plane)
CREATE TABLE pod_registry (
    pod_id              VARCHAR(64) PRIMARY KEY,
    region              VARCHAR(64) NOT NULL,
    endpoint            VARCHAR(255) NOT NULL,
    status              VARCHAR(32) DEFAULT 'active',
    capacity_percent    INTEGER DEFAULT 0,
    max_tenants         INTEGER DEFAULT 500,
    current_tenants     INTEGER DEFAULT 0,
    data_residency_zones VARCHAR(255)[],
    created_at          TIMESTAMP DEFAULT NOW()
);
```

---

## Resource Governance & Rate Limiting

### Decision: Sliding Window Counter Algorithm

We implement rate limiting using the **Sliding Window Counter** algorithm for balanced accuracy and memory efficiency.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SLIDING WINDOW COUNTER ALGORITHM                          │
└─────────────────────────────────────────────────────────────────────────────┘

Timeline:
├─────────────────┼─────────────────┼─────────────────┼
│  Previous Window │  Current Window │     Future      │
│    (60 sec)      │    (60 sec)     │                 │
├─────────────────┼─────────────────┼─────────────────┼
     45 requests       30 requests
                            ▲
                            │ Current time (25% into window)

Weighted Count = (Previous × (1 - elapsed%)) + Current
               = (45 × 0.75) + 30
               = 33.75 + 30
               = 63.75 requests

If limit = 100 requests/minute → ALLOWED (63.75 < 100)
```

### Multi-API Rate Limiting

Different API operations have separate rate limits:

```typescript
const rateLimits: Record<string, RateLimitConfig> = {
  'search': { windowMs: 60000, maxRequests: 100 },
  'index':  { windowMs: 60000, maxRequests: 50 },
  'bulk':   { windowMs: 60000, maxRequests: 10 },
  'get':    { windowMs: 60000, maxRequests: 200 },
  'delete': { windowMs: 60000, maxRequests: 30 }
};
```

### Rate Limit Response Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 37
X-RateLimit-Reset: 1701234627
X-RateLimit-Operation: search
```

### Service Tier Rate Limits

| Operation | Free | Standard | Enterprise |
|-----------|------|----------|------------|
| Search | 10/min | 100/min | 1000/min |
| Index | 5/min | 50/min | 500/min |
| Bulk | 1/min | 10/min | 100/min |
| Get | 20/min | 200/min | 2000/min |
| Delete | 5/min | 30/min | 300/min |

---

## Document Handling Strategy

### Decision: URL-Based Document Reference

The system does **NOT** store document content. Users provide document URLs, and the system:
1. Fetches content from the URL for indexing
2. Stores only the URL reference and extracted metadata
3. Returns the URL for users to access the original document

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DOCUMENT INDEXING FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  POST /documents                      INDEX TO ELASTICSEARCH
  {                                    {
    "url": "https://..../doc.pdf",       "tenant_id": "acme",
    "title": "Annual Report",     →      "document_url": "https://...",
    "metadata": { ... }                  "title": "Annual Report",
  }                                      "content": "<extracted text>",
                                         "indexed_at": "2024-01-20T..."
                                       }

                                       Note: Original document NOT stored
```

### Document Lifecycle

| Event | System Action | User Responsibility |
|-------|---------------|---------------------|
| Index | Fetch, extract, index content | Ensure URL is accessible |
| Search | Return URL in results | Access document via URL |
| Update | Re-fetch from same URL | Keep URL content updated |
| Delete | Remove index entry | URL becomes unreferenced |

---

## Authentication & Authorization

### Decision: API Key + JWT Token Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AUTHENTICATION FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  Client Request
       │
       ├─── Authorization: ApiKey dds_acme_xxx  ───► API Key Validation
       │                                                    │
       └─── Authorization: Bearer <jwt>  ──────────► JWT Verification
                                                            │
                                                            ▼
                                                   Load Tenant Context
                                                   Check Permissions
                                                   Apply Rate Limits
```

### Permission Matrix

| Role | read | write | delete | search | bulk | admin |
|------|------|-------|--------|--------|------|-------|
| Viewer | ✓ | - | - | ✓ | - | - |
| Editor | ✓ | ✓ | - | ✓ | - | - |
| Manager | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Data Encryption

### Decision: Encryption at Rest and In Transit

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENCRYPTION ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

  IN TRANSIT                           AT REST
  ──────────                           ───────
  Client ◄── TLS 1.3 ──► LB            Elasticsearch: AES-256 (KMS)
  LB ◄───── TLS 1.3 ──► API            PostgreSQL: TDE AES-256 (KMS)
  API ◄──── mTLS ──────► Services      Redis: Encrypted RDB (KMS)
```

### Encryption Standards

| Layer | Method | Key Management |
|-------|--------|----------------|
| Client → LB | TLS 1.3 | ACM/Let's Encrypt |
| Internal Services | mTLS | Internal CA |
| Elasticsearch | AES-256-GCM | AWS KMS |
| PostgreSQL | TDE (AES-256) | AWS KMS |
| Redis | AES-256 | AWS KMS |
| Backups | AES-256 | KMS (separate key) |

---

## Cross-Reference

- [MULTI_TENANCY_GUIDE.md](./MULTI_TENANCY_GUIDE.md) - Detailed multi-tenancy patterns
- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) - Deployment and scaling
- [DESIGN_DISCUSSIONS.md](./DESIGN_DISCUSSIONS.md) - Implementation discussions
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System components overview

---

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Single index per POD | Operational simplicity, resource efficiency |
| 2 | Multi-region PODs | Data residency, latency optimization |
| 3 | Tenant allocation at onboarding | Stable routing, compliance |
| 4 | Sliding window counter | Balance of accuracy and memory |
| 5 | Per-API rate limits | Granular resource control |
| 6 | URL-based documents | Reduced storage costs, user owns data |
| 7 | API key + JWT auth | Flexible authentication options |
| 8 | TLS 1.3 + AES-256 | Industry standard security |
