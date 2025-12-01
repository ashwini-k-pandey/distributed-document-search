# Distributed Document Search - API Examples

Complete API reference with curl commands, request/response examples, and usage patterns.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Document Management](#document-management)
3. [Search Operations](#search-operations)
4. [Job Status](#job-status)
5. [Health & Monitoring](#health--monitoring)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)
8. [Multi-Tenant Examples](#multi-tenant-examples)

---

## Authentication

### API Key Format
```
Authorization: Bearer dds_{tenant_prefix}_{random_string}
Example: Authorization: Bearer dds_acme_a1b2c3d4e5f6g7h8i9j0
```

### Tenant Identification
```
Header: X-Tenant-ID: {tenant-id}
Query Parameter: ?tenant={tenant-id}
```

### Example Request Headers
```bash
X-Tenant-ID: acme-corp
Authorization: Bearer dds_acme_a1b2c3d4e5f6g7h8i9j0
Content-Type: application/json
```

---

## Document Management

### 1. Create/Index a Document

**Endpoint:** `POST /documents`

**Description:** Submit a document URL for asynchronous indexing.

**Request:**
```bash
curl -X POST http://localhost:3000/documents \
  -H "X-Tenant-ID: acme-corp" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API Design Guidelines",
    "content": "Complete guide to designing REST APIs with best practices and examples.",
    "tags": ["engineering", "api", "guidelines"]
  }'
```

**Request Body:**
```json
{
  "title": "API Design Guidelines",
  "content": "Complete guide to designing REST APIs with best practices and examples.",
  "tags": ["engineering", "api", "guidelines"],
  "metadata": {
    "author": "John Doe",
    "department": "Engineering",
    "version": "1.0"
  }
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "API Design Guidelines",
    "tags": ["engineering", "api", "guidelines"],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "indexedAt": "2024-01-15T10:30:05.000Z"
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Status Codes:**
- `202 Accepted` - Document submitted for indexing
- `400 Bad Request` - Invalid request format
- `401 Unauthorized` - Missing or invalid authentication
- `429 Too Many Requests` - Rate limit exceeded

---

### 2. Get Document by ID

**Endpoint:** `GET /documents/{id}`

**Description:** Retrieve a document by its ID.

**Request:**
```bash
curl -X GET http://localhost:3000/documents/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-Tenant-ID: acme-corp"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "API Design Guidelines",
    "content": "Complete guide to designing REST APIs...",
    "tags": ["engineering", "api", "guidelines"],
    "metadata": {
      "author": "John Doe",
      "department": "Engineering"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "indexedAt": "2024-01-15T10:30:05.000Z"
  },
  "meta": {
    "tenant": "acme-corp",
    "cached": false,
    "timestamp": "2024-01-15T10:35:22.000Z"
  }
}
```

**Response (Cached):**
```json
{
  "success": true,
  "data": {
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "API Design Guidelines",
    "content": "Complete guide to designing REST APIs...",
    "tags": ["engineering", "api", "guidelines"],
    "metadata": {
      "author": "John Doe",
      "department": "Engineering"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "indexedAt": "2024-01-15T10:30:05.000Z"
  },
  "meta": {
    "tenant": "acme-corp",
    "cached": true,
    "cacheAge": 125,
    "timestamp": "2024-01-15T10:37:27.000Z"
  }
}
```

**Status Codes:**
- `200 OK` - Document found and returned
- `404 Not Found` - Document not found or belongs to different tenant
- `401 Unauthorized` - Missing or invalid authentication

---

### 3. Delete Document

**Endpoint:** `DELETE /documents/{id}`

**Description:** Delete a document from the index.

**Request:**
```bash
curl -X DELETE http://localhost:3000/documents/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-Tenant-ID: acme-corp"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "deleted": true,
    "deletedAt": "2024-01-15T10:40:00.000Z"
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:40:00.000Z"
  }
}
```

**Status Codes:**
- `200 OK` - Document successfully deleted
- `404 Not Found` - Document not found
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Tenant mismatch

---

### 4. Bulk Index Documents

**Endpoint:** `POST /documents/bulk`

**Description:** Submit multiple documents for batch indexing (max 100).

**Request:**
```bash
curl -X POST http://localhost:3000/documents/bulk \
  -H "X-Tenant-ID: acme-corp" \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "title": "Document 1",
        "content": "Content for document 1",
        "tags": ["batch"]
      },
      {
        "title": "Document 2",
        "content": "Content for document 2",
        "tags": ["batch"]
      },
      {
        "title": "Document 3",
        "content": "Content for document 3",
        "tags": ["batch"]
      }
    ]
  }'
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "bulkId": "bulk_7f3d8a2b-1c4e-5f6a-9b8c-0d1e2f3a4b5c",
    "totalDocuments": 3,
    "submittedAt": "2024-01-15T10:45:00.000Z",
    "estimatedCompletionTime": "2024-01-15T10:45:10.000Z"
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:45:00.000Z"
  }
}
```

**Status Codes:**
- `202 Accepted` - Bulk documents submitted
- `400 Bad Request` - Exceeds max documents (100) or invalid format
- `401 Unauthorized` - Missing or invalid authentication
- `429 Too Many Requests` - Rate limit exceeded

---

## Search Operations

### 1. Basic Text Search

**Endpoint:** `GET /search`

**Description:** Search documents with simple text query.

**Request:**
```bash
curl -X GET "http://localhost:3000/search?q=API%20design&page=1&limit=20" \
  -H "X-Tenant-ID: acme-corp"
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | required | Search query |
| `page` | integer | 1 | Page number (starting at 1) |
| `limit` | integer | 20 | Results per page (max 100) |
| `highlight` | boolean | false | Include highlighted results |
| `fuzzy` | boolean | false | Enable fuzzy matching |
| `sort` | string | "relevance" | Sort by: relevance, newest, oldest |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "query": "API design",
    "hits": [
      {
        "document": {
          "documentId": "550e8400-e29b-41d4-a716-446655440000",
          "title": "API Design Guidelines",
          "content": "Complete guide to designing REST APIs with best practices...",
          "tags": ["engineering", "api", "guidelines"],
          "createdAt": "2024-01-15T10:30:00.000Z"
        },
        "score": 12.5,
        "highlights": {
          "title": ["<mark>API</mark> <mark>Design</mark> Guidelines"],
          "content": ["best practices for <mark>REST</mark> <mark>API</mark> <mark>design</mark>..."]
        }
      },
      {
        "document": {
          "documentId": "660e8400-e29b-41d4-a716-446655440111",
          "title": "RESTful Architecture Patterns",
          "content": "Modern patterns for building scalable APIs...",
          "tags": ["architecture", "api"],
          "createdAt": "2024-01-14T15:20:00.000Z"
        },
        "score": 8.3,
        "highlights": {
          "content": ["...scalable <mark>APIs</mark> following <mark>RESTful</mark> <mark>design</mark>..."]
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
      "fuzzyMatches": 0
    }
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:50:00.000Z"
  }
}
```

**Status Codes:**
- `200 OK` - Search completed successfully
- `400 Bad Request` - Invalid query parameters
- `401 Unauthorized` - Missing or invalid authentication
- `429 Too Many Requests` - Rate limit exceeded

---

### 2. Advanced Search with Filters

**Endpoint:** `POST /search`

**Description:** Complex search with filtering, facets, and advanced queries.

**Request:**
```bash
curl -X POST http://localhost:3000/search \
  -H "X-Tenant-ID: acme-corp" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "API design",
    "filters": {
      "tags": ["engineering", "api"],
      "dateRange": {
        "from": "2024-01-01",
        "to": "2024-12-31"
      }
    },
    "facets": ["tags", "createdAt"],
    "page": 1,
    "limit": 20,
    "highlight": true,
    "fuzzy": true
  }'
```

**Request Body:**
```json
{
  "query": "API design",
  "filters": {
    "tags": ["engineering", "api"],
    "dateRange": {
      "from": "2024-01-01",
      "to": "2024-12-31"
    },
    "author": "John Doe"
  },
  "facets": ["tags", "createdAt"],
  "sortBy": "relevance",
  "page": 1,
  "limit": 20,
  "highlight": true,
  "fuzzy": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "query": "API design",
    "hits": [
      {
        "document": {
          "documentId": "550e8400-e29b-41d4-a716-446655440000",
          "title": "API Design Guidelines",
          "content": "Complete guide to designing REST APIs...",
          "tags": ["engineering", "api", "guidelines"],
          "metadata": {
            "author": "John Doe",
            "department": "Engineering"
          },
          "createdAt": "2024-01-15T10:30:00.000Z"
        },
        "score": 12.5,
        "highlights": {
          "title": ["<mark>API</mark> <mark>Design</mark> Guidelines"]
        }
      }
    ],
    "facets": {
      "tags": {
        "engineering": 42,
        "api": 38,
        "guidelines": 15
      },
      "createdAt": {
        "2024-01": 23,
        "2024-02": 19
      }
    },
    "pagination": {
      "total": 38,
      "page": 1,
      "limit": 20,
      "totalPages": 2,
      "hasNext": true,
      "hasPrev": false
    },
    "meta": {
      "took": 62,
      "cached": false,
      "fuzzyMatches": 3
    }
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:52:00.000Z"
  }
}
```

---

### 3. Search with Pagination

**Endpoint:** `GET /search?q={query}&page={page}&limit={limit}`

**Description:** Navigate through search results using pagination.

**Request - Page 1:**
```bash
curl -X GET "http://localhost:3000/search?q=API&page=1&limit=20" \
  -H "X-Tenant-ID: acme-corp"
```

**Request - Page 2:**
```bash
curl -X GET "http://localhost:3000/search?q=API&page=2&limit=20" \
  -H "X-Tenant-ID: acme-corp"
```

**Response (with pagination info):**
```json
{
  "success": true,
  "data": {
    "hits": [ /* ... */ ],
    "pagination": {
      "total": 156,
      "page": 2,
      "limit": 20,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": true,
      "nextPage": 3,
      "prevPage": 1
    }
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:55:00.000Z"
  }
}
```

---

### 4. Search with Caching

**First Request (Cache Miss):**
```bash
curl -X GET "http://localhost:3000/search?q=API%20design" \
  -H "X-Tenant-ID: acme-corp" \
  -w "\nX-Cache: %{http_code}\n"
```

**Response Headers:**
```http
X-Cache-Hit: false
X-Cache-Age: 0
X-Response-Time: 45ms
```

**Subsequent Request (Cache Hit):**
```bash
curl -X GET "http://localhost:3000/search?q=API%20design" \
  -H "X-Tenant-ID: acme-corp"
```

**Response Headers:**
```http
X-Cache-Hit: true
X-Cache-Age: 125
X-Response-Time: 2ms
```

**Response Body:**
```json
{
  "success": true,
  "data": { /* ... same results ... */ },
  "meta": {
    "tenant": "acme-corp",
    "cached": true,
    "cacheAge": 125,
    "timestamp": "2024-01-15T10:55:00.000Z"
  }
}
```

---

## Job Status

### Get Document Indexing Job Status

**Endpoint:** `GET /jobs/{jobId}`

**Description:** Check the status of an asynchronous indexing job.

**Request:**
```bash
curl -X GET http://localhost:3000/jobs/job_7f3d8a2b-1c4e-5f6a-9b8c-0d1e2f3a4b5c \
  -H "X-Tenant-ID: acme-corp"
```

**Response (Job Pending):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_7f3d8a2b-1c4e-5f6a-9b8c-0d1e2f3a4b5c",
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "API Design Guidelines",
    "status": "pending",
    "progress": {
      "stage": "queued",
      "percentage": 0
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "estimatedCompletionTime": "2024-01-15T10:30:05.000Z"
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:30:02.000Z"
  }
}
```

**Response (Job In Progress):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_7f3d8a2b-1c4e-5f6a-9b8c-0d1e2f3a4b5c",
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "API Design Guidelines",
    "status": "processing",
    "progress": {
      "stage": "indexing",
      "percentage": 75
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "startedAt": "2024-01-15T10:30:01.000Z",
    "estimatedCompletionTime": "2024-01-15T10:30:04.000Z"
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:30:03.000Z"
  }
}
```

**Response (Job Completed):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_7f3d8a2b-1c4e-5f6a-9b8c-0d1e2f3a4b5c",
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "API Design Guidelines",
    "status": "completed",
    "progress": {
      "stage": "completed",
      "percentage": 100
    },
    "result": {
      "indexed": true,
      "tokensExtracted": 1250,
      "indexSize": "2.5 KB"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "startedAt": "2024-01-15T10:30:01.000Z",
    "completedAt": "2024-01-15T10:30:05.000Z"
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:30:06.000Z"
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
    "title": "API Design Guidelines",
    "status": "failed",
    "error": {
      "code": "INVALID_CONTENT_TYPE",
      "message": "Document content type not supported. Supported: PDF, HTML, TXT, MD",
      "details": {
        "providedType": "application/octet-stream",
        "supportedTypes": ["application/pdf", "text/html", "text/plain", "text/markdown"]
      }
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "startedAt": "2024-01-15T10:30:01.000Z",
    "failedAt": "2024-01-15T10:30:02.000Z",
    "retryable": false
  },
  "meta": {
    "tenant": "acme-corp",
    "timestamp": "2024-01-15T10:30:03.000Z"
  }
}
```

---

## Health & Monitoring

### 1. Basic Health Check

**Endpoint:** `GET /health`

**Request:**
```bash
curl -X GET http://localhost:3000/health
```

**Response (Healthy):**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2024-01-15T10:55:00.000Z"
}
```

**Status Codes:**
- `200 OK` - Service is healthy
- `503 Service Unavailable` - Service is down or degraded

---

### 2. Readiness Check

**Endpoint:** `GET /health/ready`

**Description:** Check if service is ready to accept requests.

**Request:**
```bash
curl -X GET http://localhost:3000/health/ready
```

**Response (Ready):**
```json
{
  "ready": true,
  "dependencies": {
    "elasticsearch": "ready",
    "redis": "ready",
    "postgres": "ready"
  },
  "timestamp": "2024-01-15T10:55:00.000Z"
}
```

**Status Codes:**
- `200 OK` - Service is ready
- `503 Service Unavailable` - Service dependencies not ready

---

### 3. Detailed Health Status

**Endpoint:** `GET /health/detailed`

**Description:** Comprehensive health status with all dependencies.

**Request:**
```bash
curl -X GET http://localhost:3000/health/detailed
```

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "dependencies": {
    "elasticsearch": {
      "status": "healthy",
      "response_time": 12,
      "nodes": 3,
      "docs_count": 1250000
    },
    "redis": {
      "status": "healthy",
      "response_time": 2,
      "connected_clients": 45
    },
    "postgres": {
      "status": "healthy",
      "response_time": 15,
      "active_connections": 12
    }
  },
  "api_stats": {
    "requests_total": 125000,
    "requests_per_second": 34.7,
    "avg_response_time": 48,
    "error_rate": 0.2
  },
  "cache_stats": {
    "hits": 98500,
    "misses": 26500,
    "hit_rate": 0.788
  },
  "timestamp": "2024-01-15T10:55:00.000Z"
}
```

---

### 4. Prometheus Metrics

**Endpoint:** `GET /metrics`

**Request:**
```bash
curl -X GET http://localhost:3000/metrics
```

**Response (Prometheus format):**
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/search",status="200",tenant="acme-corp"} 5234
http_requests_total{method="GET",path="/search",status="200",tenant="other-tenant"} 3125
http_requests_total{method="POST",path="/documents",status="202",tenant="acme-corp"} 1024

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.01",path="/health"} 5000
http_request_duration_seconds_bucket{le="0.05",path="/search"} 8234
http_request_duration_seconds_bucket{le="0.1",path="/search"} 8456

# HELP elasticsearch_docs_count Documents in Elasticsearch
# TYPE elasticsearch_docs_count gauge
elasticsearch_docs_count{tenant="acme-corp"} 15000
elasticsearch_docs_count{tenant="other-tenant"} 8500

# HELP redis_connected_clients Redis connected clients
# TYPE redis_connected_clients gauge
redis_connected_clients 45
```

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request format",
    "details": {
      "field": "query",
      "reason": "Query parameter is required"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:55:00.000Z"
  }
}
```

#### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid authentication credentials",
    "details": {
      "expected": "Authorization header with API key",
      "received": "none"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:55:00.000Z"
  }
}
```

#### 403 Forbidden (Cross-Tenant Access)
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Document belongs to different tenant",
    "details": {
      "requestedTenant": "other-tenant",
      "documentTenant": "acme-corp"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:55:00.000Z"
  }
}
```

#### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Document not found",
    "details": {
      "documentId": "550e8400-e29b-41d4-a716-446655440000"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:55:00.000Z"
  }
}
```

#### 429 Too Many Requests (Rate Limited)
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded for operation: search",
    "details": {
      "operation": "search",
      "limit": 100,
      "window": "60000ms",
      "resetTime": "2024-01-15T10:56:00.000Z"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:55:30.000Z"
  }
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error occurred",
    "details": {
      "requestId": "req_abc123def456",
      "errorId": "err_xyz789"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:55:00.000Z"
  }
}
```

#### 503 Service Unavailable
```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable",
    "details": {
      "affectedServices": ["elasticsearch"],
      "retryAfter": 30
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:55:00.000Z"
  }
}
```

---

## Rate Limiting

### Understanding Rate Limits

**Standard Tier Example:**
- Search: 100 requests per minute
- Index: 50 requests per minute
- Bulk: 10 requests per minute

### Rate Limit Headers

**On Successful Request:**
```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 37
X-RateLimit-Reset: 1701234627
X-RateLimit-Operation: search
```

**When Approaching Limit:**
```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1701234627
X-RateLimit-Operation: search
```

**When Rate Limited:**
```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1701234627
Retry-After: 23
X-RateLimit-Operation: search
```

### Example: Handling Rate Limits

**Bash Script:**
```bash
#!/bin/bash

for i in {1..150}; do
  response=$(curl -s -w "\n%{http_code}" \
    http://localhost:3000/search?q=API \
    -H "X-Tenant-ID: acme-corp")
  
  status=$(echo "$response" | tail -1)
  body=$(echo "$response" | head -n-1)
  
  if [ "$status" = "429" ]; then
    retry_after=$(echo "$body" | jq -r '.error.details.resetTime')
    echo "Rate limited. Retry after: $retry_after"
    sleep 5
  else
    echo "Request $i: Success"
  fi
done
```

---

## Multi-Tenant Examples

### Scenario: Two Tenants Sharing Service

#### Tenant A: ACME Corp
```bash
# Create document for ACME
curl -X POST http://localhost:3000/documents \
  -H "X-Tenant-ID: acme-corp" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "ACME Annual Report",
    "content": "ACME Corp financial results and strategic initiatives..."
  }'

# Search in ACME tenant
curl -X GET "http://localhost:3000/search?q=financial" \
  -H "X-Tenant-ID: acme-corp"
```

#### Tenant B: TechCorp
```bash
# Create document for TechCorp
curl -X POST http://localhost:3000/documents \
  -H "X-Tenant-ID: techcorp-inc" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "TechCorp Product Roadmap",
    "content": "TechCorp product strategy and feature roadmap..."
  }'

# Search in TechCorp tenant
curl -X GET "http://localhost:3000/search?q=product" \
  -H "X-Tenant-ID: techcorp-inc"
```

### Data Isolation Verification

**ACME accessing TechCorp data (Should Fail):**
```bash
curl -X GET http://localhost:3000/documents/techcorp-document-id \
  -H "X-Tenant-ID: acme-corp"
```

**Response:**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Document belongs to different tenant"
  }
}
```

---

## Integration Examples

### Using with Python

```python
import requests
import json

BASE_URL = "http://localhost:3000"
TENANT_ID = "acme-corp"

# Headers for authentication
headers = {
    "X-Tenant-ID": TENANT_ID,
    "Content-Type": "application/json"
}

# Create document
def create_document(title, content):
    response = requests.post(
        f"{BASE_URL}/documents",
        headers=headers,
        json={"title": title, "content": content}
    )
    return response.json()

# Search documents
def search_documents(query, page=1, limit=20):
    response = requests.get(
        f"{BASE_URL}/search",
        headers=headers,
        params={
            "q": query,
            "page": page,
            "limit": limit
        }
    )
    return response.json()

# Example usage
doc_result = create_document("API Guide", "Complete API reference...")
print(f"Created: {doc_result['data']['documentId']}")

search_result = search_documents("API")
print(f"Found {search_result['data']['pagination']['total']} documents")
```

### Using with Node.js

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TENANT_ID = 'acme-corp';

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Tenant-ID': TENANT_ID,
    'Content-Type': 'application/json'
  }
});

// Create document
async function createDocument(title, content) {
  const response = await client.post('/documents', {
    title,
    content
  });
  return response.data;
}

// Search documents
async function searchDocuments(query, page = 1, limit = 20) {
  const response = await client.get('/search', {
    params: { q: query, page, limit }
  });
  return response.data;
}

// Example usage
(async () => {
  const doc = await createDocument('API Guide', 'Complete API reference...');
  console.log(`Created: ${doc.data.documentId}`);
  
  const results = await searchDocuments('API');
  console.log(`Found ${results.data.pagination.total} documents`);
})();
```

---

*Document Version: 1.0*
*Last Updated: December 1, 2025*
