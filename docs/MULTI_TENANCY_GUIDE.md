# Multi-Tenancy & Performance Guide

## Table of Contents
1. [Multi-Tenancy Approaches](#1-multi-tenancy-approaches)
2. [Data Isolation Strategies](#2-data-isolation-strategies)
3. [Index Strategy Comparison](#3-index-strategy-comparison)
4. [Tenant Isolation Implementation](#4-tenant-isolation-implementation)
5. [Document Storage Strategy](#5-document-storage-strategy)
6. [Performance Optimization](#6-performance-optimization)
7. [Single Tenant & Horizontal Scaling](#7-single-tenant--horizontal-scaling)
8. [Single Index & Horizontal Scaling](#8-single-index--horizontal-scaling)

---

## 1. Multi-Tenancy Approaches

### 1.1 Single Database, Shared Schema
All tenants share the same tables with a `tenant_id` column.

| Pros | Cons |
|------|------|
| Lowest cost | Risk of data leakage |
| Simplest deployment | Noisy neighbor issues |
| Easy maintenance | Limited customization |

### 1.2 Single Database, Separate Schemas
Each tenant gets their own schema within one database.

| Pros | Cons |
|------|------|
| Better isolation | Schema management complexity |
| Easier per-tenant backup/restore | Connection pooling challenges |

### 1.3 Separate Databases per Tenant
Each tenant has a completely isolated database.

| Pros | Cons |
|------|------|
| Strongest isolation | Higher operational cost |
| Independent scaling | Complex cross-tenant queries |
| Easy compliance | More infrastructure to manage |

### 1.4 Hybrid/Tiered Approach (Recommended)
Different isolation levels based on tenant tier.

```
┌─────────────────────────────────────────────────────────────┐
│   Free/Small Tenants          Enterprise Tenants            │
│   ──────────────────          ──────────────────            │
│   Shared index                Dedicated index               │
│   (routing by tenant_id)      (documents_{tenant_id})       │
│   Lower isolation             Full isolation                │
│   Cost effective              Premium pricing               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Data Isolation Strategies

| Strategy | Isolation Level | Use Case |
|----------|----------------|----------|
| Row-Level Security (RLS) | Logical | Shared schema, enforced at DB level |
| Application-Level Filtering | Logical | All queries include tenant filter |
| Encryption per Tenant | Cryptographic | Separate keys per tenant |
| Network Isolation (VPC/Subnet) | Physical | High-security/compliance |
| Separate Compute | Physical | Noisy neighbor prevention |

### Key Considerations
- **Compliance requirements**: GDPR, HIPAA, SOC2 may mandate physical isolation
- **Scale**: Number of tenants and data volume per tenant
- **Cost**: Shared is cheapest, dedicated is most expensive
- **Performance**: Dedicated prevents noisy neighbor issues

---

## 3. Index Strategy Comparison

### 3.1 Shared Index vs Per-Tenant Index

| Aspect | Shared Index | Per-Tenant Index |
|--------|--------------|------------------|
| Data Isolation | Logical (filter-based) | Physical (separate indices) |
| Leak Risk | Higher (bug = exposure) | Lower (bug = 404) |
| Shard Count | Low (fixed) | High (N × shards per tenant) |
| Cluster Overhead | Low | High (cluster state bloat) |
| Tenant Deletion | Delete-by-query (slow) | Drop index (instant) |
| Cross-Tenant Analytics | Easy | Complex |
| Compliance | May not satisfy | Usually satisfies |

### 3.2 Sharding in Shared Index

#### Without Routing (Default)
Documents distributed randomly - queries hit ALL shards.

#### With Custom Routing (Recommended)
```json
PUT /documents/_doc/1?routing=tenant_a
{
  "tenant_id": "tenant_a",
  "content": "..."
}
```
Queries hit only relevant shard(s).

#### Partition Routing (Large Tenants)
```json
PUT /documents
{
  "settings": {
    "number_of_shards": 12,
    "index.routing_partition_size": 3
  }
}
```
Distributes tenant data across multiple shards to avoid hot spots.

### 3.3 Decision Matrix

| Choose Shared Index If | Choose Per-Tenant Index If |
|------------------------|----------------------------|
| Many small tenants (1000+) | Few large tenants (<100) |
| Cost is primary concern | Compliance requires isolation |
| Uniform tenant sizes | Varying tenant sizes |
| Cross-tenant analytics needed | Tenant-specific backup required |

---

## 4. Tenant Isolation Implementation

### 4.1 Defense in Depth

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Application Layer                             │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Query Layer                                   │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Elasticsearch Security                        │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Encryption                                    │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Application Layer
```python
class TenantMiddleware:
    def process_request(self, request):
        tenant_id = get_tenant_from_token(request.auth_token)
        if not tenant_id:
            raise UnauthorizedException()
        request.tenant_id = tenant_id
```

### 4.3 Repository Pattern
```python
class DocumentRepository:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id

    def search(self, query: str):
        return es.search(
            index="documents",
            routing=self.tenant_id,
            body={
                "query": {
                    "bool": {
                        "filter": [{"term": {"tenant_id": self.tenant_id}}],
                        "must": [{"match": {"content": query}}]
                    }
                }
            }
        )
```

### 4.4 Elasticsearch Document Level Security
```json
POST /_security/role/tenant_a_role
{
  "indices": [
    {
      "names": ["documents"],
      "privileges": ["read", "write"],
      "query": {
        "term": { "tenant_id": "tenant_a" }
      }
    }
  ]
}
```

### 4.5 Field-Level Encryption
```python
class TenantEncryption:
    def __init__(self, tenant_id: str):
        self.key = get_tenant_key(tenant_id)
        self.cipher = Fernet(self.key)

    def encrypt_field(self, value: str) -> str:
        return self.cipher.encrypt(value.encode()).decode()
```

### 4.6 Minimum Requirements

| Priority | Mechanism |
|----------|-----------|
| **Must Have** | Tenant from auth token (not user input) |
| **Must Have** | Mandatory tenant filter in all queries |
| **Must Have** | Routing by tenant_id |
| **Should Have** | Elasticsearch DLS roles |
| **Should Have** | Audit logging |
| **Nice to Have** | Field-level encryption |

---

## 5. Document Storage Strategy

### 5.1 Recommended Approach: Text-Only Search Service

```
┌─────────────────────────────────────────────────────────────┐
│                     SEARCH SERVICE                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Elasticsearch                            │  │
│  │  • text content                                       │  │
│  │  • metadata (title, tags, timestamps)                 │  │
│  │  • external_url (optional reference)                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   USER'S RESPONSIBILITY                     │
│  • Original PDFs, Word docs, images                         │
│  • Their own S3, Google Drive, SharePoint, etc.            │
│  • File versioning, backups, access control                │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Benefits
- Simpler system (no file storage management)
- Lower costs (no blob storage bills)
- Clear responsibility separation
- Faster development
- Flexible integration with any storage system

### 5.3 API Design
```json
POST /documents
{
  "tenant_id": "tenant_a",
  "title": "Q3 Report",
  "content": "Revenue increased by 25%...",
  "source_url": "https://their-storage.com/reports/q3.pdf",
  "metadata": {
    "author": "John",
    "department": "Finance"
  }
}
```

---

## 6. Performance Optimization

### 6.1 Achieving Sub-Millisecond Query Latency

#### Index Settings
```json
PUT /documents_{tenant_id}
{
  "settings": {
    "index": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "refresh_interval": "1s",
      "translog.durability": "async",
      "translog.sync_interval": "5s"
    }
  }
}
```

#### Mapping Optimizations
```json
{
  "mappings": {
    "properties": {
      "tenant_id": { "type": "keyword" },
      "title": {
        "type": "text",
        "fields": { "keyword": { "type": "keyword" } }
      },
      "content": {
        "type": "text",
        "index_options": "offsets",
        "term_vector": "with_positions_offsets"
      },
      "status": {
        "type": "keyword",
        "eager_global_ordinals": true
      }
    }
  }
}
```

#### Query Optimizations
```json
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "tenant_id": "tenant_a" }},
        { "range": { "created_at": { "gte": "2024-01-01" }}}
      ],
      "must": [
        { "match": { "content": "search term" }}
      ]
    }
  }
}
```

### 6.2 Redis Caching Strategy

#### Cache Key Pattern
```
search:{tenant_id}:{query_hash}  - Search results (TTL: 5 min)
doc:{tenant_id}:{document_id}    - Individual documents (TTL: 10 min)
ratelimit:tenant:{tenant_id}     - Rate limit counters
```

#### Implementation
```python
class SearchCache:
    async def get_or_search(self, tenant_id: str, query: dict):
        cache_key = f"search:{tenant_id}:{hash(query)}"

        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)

        results = await self.es.search(...)
        await self.redis.setex(cache_key, 300, json.dumps(results))
        return results
```

### 6.3 Index Refresh Interval Tuning

| Mode | Refresh Interval | Use Case |
|------|------------------|----------|
| Search optimized | 1s | Normal operations |
| Bulk indexing | 30s | Large data imports |
| Real-time | 100ms | Critical visibility needs |

```python
async def set_bulk_mode(self, tenant_id: str):
    await self.es.indices.put_settings(
        index=f"documents_{tenant_id}",
        body={"index": {"refresh_interval": "30s"}}
    )

async def set_search_mode(self, tenant_id: str):
    await self.es.indices.put_settings(
        index=f"documents_{tenant_id}",
        body={"index": {"refresh_interval": "1s"}}
    )
```

### 6.4 Rate Limiting (Sliding Window)
```python
class RateLimiter:
    async def is_allowed(self, tenant_id: str) -> bool:
        key = f"ratelimit:tenant:{tenant_id}"
        now = time.time()

        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, now - self.window)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, self.window)

        results = await pipe.execute()
        return results[2] <= self.limit
```

### 6.5 Performance Metrics & Monitoring

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Query latency P50 | <10ms | >50ms |
| Query latency P99 | <100ms | >500ms |
| Cache hit rate | >80% | <60% |
| Indexing rate | >1000 docs/s | <500 docs/s |

```python
from prometheus_client import Histogram

SEARCH_LATENCY = Histogram(
    'search_latency_seconds',
    'Search query latency',
    ['tenant_id'],
    buckets=[.001, .005, .01, .025, .05, .1, .25, .5, 1]
)
```

### 6.6 Performance Checklist

```
Infrastructure:
  ☐ NVMe SSDs for Elasticsearch
  ☐ Adequate heap (50% of index size, max 31GB)
  ☐ App servers co-located with ES cluster

Elasticsearch:
  ☐ Keyword fields for filters
  ☐ Filter context for non-scoring queries
  ☐ Appropriate shard sizing (10-50GB each)
  ☐ Refresh interval tuned per use case

Caching:
  ☐ Redis for search results (5min TTL)
  ☐ Redis for documents (10min TTL)
  ☐ Cache invalidation on writes

Monitoring:
  ☐ Latency histograms (P50, P95, P99)
  ☐ Cache hit/miss ratios
  ☐ Alerting on SLA breaches
```

---

## 7. Single Tenant & Horizontal Scaling

*Reserved for future documentation on single-tenant deployment patterns.*

---

## 8. Single Index & Horizontal Scaling

### 8.1 Rate Limiting for Noisy Neighbor Prevention

When using a single shared index, rate limiting becomes critical to prevent one tenant from degrading performance for others.

#### Noisy Neighbor Attack Vectors

```
┌────────────────────────────────────────────────────────────────┐
│  SINGLE INDEX: documents                                       │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐     │
│  │ Shard 0  │ Shard 1  │ Shard 2  │ Shard 3  │ Shard 4  │     │
│  │ Mixed    │ Mixed    │ Mixed    │ Mixed    │ Mixed    │     │
│  │ Tenants  │ Tenants  │ Tenants  │ Tenants  │ Tenants  │     │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘     │
└────────────────────────────────────────────────────────────────┘
         ↑                    ↑                    ↑
    Tenant A              Tenant B              Tenant C
    100 req/s             10 req/s              5 req/s
    (noisy)               (normal)             (normal)
```

**Without routing**: Tenant A's queries hit ALL shards, affecting B and C.

#### Multi-Dimensional Rate Limits

| Dimension | Limit | Window | Purpose |
|-----------|-------|--------|---------|
| Request count | 100/tenant | 60s | Overall throughput |
| Search operations | 50/tenant | 60s | Query load |
| Index operations | 20/tenant | 60s | Write load |
| Bulk operations | 5/tenant | 60s | Heavy operations |
| Query cost units | 500/tenant | 60s | Resource fairness |
| Concurrent requests | 10/tenant | real-time | Thread protection |
| Global cluster | 10,000 total | 60s | System protection |

#### Operation Cost Model

| Operation | Cost | Rationale |
|-----------|------|-----------|
| Simple search (cached) | 0 | No ES hit |
| Simple search (uncached) | 1 | Basic query |
| Search with highlighting | 3 | Extra processing |
| Search with aggregations | 5 | Memory intensive |
| Fuzzy/wildcard search | 8 | All shards scan |
| Single document index | 2 | Write + refresh |
| Bulk index (per 10 docs) | 5 | Batch overhead |
| Delete by query | 20 | Expensive |

### 8.2 Sliding Window Memory Cost Analysis

#### Algorithm Comparison

**Sliding Window Log (Exact)** - Stores every request timestamp in Redis ZSET:

```
ZSET: ratelimit:tenant_a:requests
┌─────────────────────────────────────────────────────────┐
│  Score (timestamp)    │  Member (unique ID)             │
├───────────────────────┼─────────────────────────────────┤
│  1732963200001        │  "1732963200001:abc123"         │
│  1732963200005        │  "1732963200005:def456"         │
│  ...                  │  (one entry per request)        │
└─────────────────────────────────────────────────────────┘
```

Memory per entry: ~90-100 bytes

**Sliding Window Counter (Approximate)** - Splits window into buckets:

```
┌─────────────────────────────────────────────────────────┐
│  60-second window split into 6 buckets (10s each)       │
│                                                         │
│  HASH: ratelimit:tenant_a:counters                      │
│  ┌────────┬────────┬────────┬────────┬────────┬───────┐│
│  │ b:0    │ b:1    │ b:2    │ b:3    │ b:4    │ b:5   ││
│  │ 15     │ 22     │ 18     │ 20     │ 17     │ 8     ││
│  └────────┴────────┴────────┴────────┴────────┴───────┘│
└─────────────────────────────────────────────────────────┘
```

Memory per tenant: ~150 bytes (fixed)

#### Memory Scaling Comparison

| Tenants | Requests/min | Sliding Window Log | Sliding Window Counter |
|---------|--------------|-------------------|------------------------|
| 100 | 100 | 1 MB | 15 KB |
| 1,000 | 100 | 10 MB | 150 KB |
| 10,000 | 100 | 100 MB | 1.5 MB |
| 10,000 | 1,000 | 1 GB | 1.5 MB |

#### Algorithm Trade-offs

| Metric | Sliding Window Log | Sliding Window Counter |
|--------|-------------------|------------------------|
| **Accuracy** | Exact | ~97-99% |
| **Memory growth** | O(requests) | O(1) per tenant |
| **Redis operations** | ZADD, ZREMRANGEBYSCORE, ZCARD | HINCRBY, HGETALL |
| **Burst detection** | Precise | Approximate |
| **Implementation** | More complex | Simpler |

#### Multi-Dimensional Memory Impact

With 4 rate limit dimensions (requests, search, index, cost):

```
Sliding Window Log:
  Memory = Tenants × Dimensions × Requests × 100B
  10K tenants × 4 dimensions × 100 req = 400 MB

Sliding Window Counter:
  Memory = Tenants × Dimensions × 150B
  10K tenants × 4 dimensions × 150B = 6 MB
```

### 8.3 Recommended Hybrid Approach

```
┌─────────────────────────────────────────────────────────────┐
│  HYBRID RATE LIMITING                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Sliding Window Counter (primary)                           │
│  ├── Request count limits                                   │
│  ├── Operation-type limits                                  │
│  └── Memory: O(tenants) - predictable                       │
│                                                             │
│  Sliding Window Log (selective)                             │
│  ├── Concurrent request tracking (small window: 1-5s)       │
│  ├── Abuse detection / forensics                            │
│  └── Memory: bounded by short window                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Estimated total memory (10K tenants):**

| Component | Memory |
|-----------|--------|
| Counter-based limits (4 dimensions) | 6 MB |
| Concurrent tracking (5s window, 10 max) | 5 MB |
| Overhead & fragmentation | 4 MB |
| **Total** | **~15 MB** |

### 8.4 Redis Key Structure

```
ratelimit:{tenant}:requests      # Sliding window counter HASH
ratelimit:{tenant}:search        # Search-specific counter
ratelimit:{tenant}:index         # Index-specific counter
ratelimit:{tenant}:cost          # Cost units consumed
ratelimit:{tenant}:concurrent    # Active requests (ZSET, short window)
ratelimit:global:requests        # Global protection counter
```

### 8.5 Lua Script for Atomic Sliding Window

```lua
-- Key: KEYS[1] = ratelimit:{tenant}:requests
-- Args: ARGV[1] = now, ARGV[2] = window_ms, ARGV[3] = max_requests

local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)

-- Count current requests
local count = redis.call('ZCARD', KEYS[1])

if count >= max then
    return {0, count, max}  -- Denied
end

-- Add new request
redis.call('ZADD', KEYS[1], now, now .. ':' .. math.random())
redis.call('EXPIRE', KEYS[1], math.ceil(window / 1000))

return {1, count + 1, max}  -- Allowed
```

### 8.6 Memory Optimization Techniques

| Technique | Savings | Trade-off |
|-----------|---------|-----------|
| Shorter window | Linear reduction | Less burst protection |
| Fewer buckets | ~20-30% | Lower accuracy |
| Lazy expiration | Amortized cleanup | Temporary bloat |
| Key compression | ~30% | CPU overhead |
| Only track active tenants | Variable | Cold-start latency |

### 8.7 Implementation Priority

| Priority | Component | Noisy Neighbor Impact |
|----------|-----------|----------------------|
| **P0** | Custom routing by tenant_id | Prevents shard scanning |
| **P0** | Sliding window counter | Accurate limiting |
| **P1** | Operation-based cost model | Fair resource allocation |
| **P1** | Concurrency limits | Thread pool protection |
| **P2** | Query timeout per tenant | Long query prevention |
| **P2** | Tiered limits by tenant plan | Business differentiation |

---

## References
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) - Production deployment guide
