# Quick Reference: osgrep Architecture

Quick lookup guide for developers working on osgrep.

## Key Technologies

| Technology | Purpose | Version/Type |
|------------|---------|--------------|
| Transformers.js | Local ML inference | @huggingface/transformers ^3.8.0 |
| LanceDB | Vector database | @lancedb/lancedb ^0.22.3 |
| Tree-sitter | Code parsing/chunking | web-tree-sitter ^0.25.10 |

## Models

| Model | Purpose | Dimensions | Size |
|-------|---------|------------|------|
| mxbai-embed-xsmall-v1 | Text → vector embeddings | 384 | ~75MB |
| mxbai-rerank-xsmall-v1 | Query-doc relevance scoring | N/A | ~75MB |

**Location**: `~/.osgrep/models/mixedbread-ai/`

## Important Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| VECTOR_DIMENSIONS | 384 | `local-store.ts:84` | Embedding size |
| TARGET_DIMENSIONS | 384 | `worker.ts:46` | Worker embedding size |
| RRF_K | 60 | `local-store.ts:880` | RRF fusion constant |
| RERANK_BLEND | 0.7/0.3 | `local-store.ts:931` | Rerank vs RRF weight |
| IVF_MIN_ROWS | 256 | `local-store.ts:804` | Minimum for IVF index |
| MAX_WORKER_RSS | 6GB | `local-store.ts:81` | Worker memory limit |
| EMBED_BATCH_SIZE | 12 | `local-store.ts:85` | Chunks per embed batch |
| WRITE_BATCH_SIZE | 50 | `local-store.ts:86` | DB write batch size |
| VECTOR_CACHE_MAX | 10000 | `local-store.ts:54-57` | LRU cache size |

## Vector Index Types

| Type | When Used | Performance | Accuracy |
|------|-----------|-------------|----------|
| Flat | < 256 chunks | O(N) | 100% |
| IVF_FLAT | ≥ 256 chunks | O(nprobe × cluster_size) | ~95% |

**IVF Parameters**:
- Clusters: ~sqrt(N) (e.g., 100 for 10k chunks)
- nprobe: 20 (clusters searched per query)
- Training: k-means with ~25 iterations

## Search Pipeline

```
Query → Embed → Vector Search (IVF) + FTS → RRF Fusion → Rerank → Results
         30ms     10ms          5ms          <1ms        50ms     ~100ms
```

## File Locations

### Core Implementation
- `src/lib/local-store.ts` - Main store, search, indexing (1049 lines)
- `src/lib/worker.ts` - ML model worker thread (202 lines)
- `src/lib/chunker.ts` - Tree-sitter code chunking (451 lines)
- `src/lib/model-loader.ts` - Model download/setup (87 lines)

### Commands
- `src/commands/search.ts` - Search command (480 lines)
- `src/commands/index.ts` - Index command
- `src/commands/setup.ts` - Setup command
- `src/commands/doctor.ts` - Health check command

### Utilities
- `src/utils.ts` - File hashing, sync, metadata
- `src/lib/store-resolver.ts` - Auto store ID generation
- `src/lib/lru.ts` - LRU cache implementation

## Key Algorithms

### RRF (Reciprocal Rank Fusion)
```typescript
score = Σ 1 / (k + rank_i)
where k = 60, rank_i = position in result list
```

### Score Blending
```typescript
final_score = 0.7 × rerank_score + 0.3 × rrf_score
```

### IVF Search
```typescript
1. Find top 20 nearest centroids to query
2. Search only vectors in those clusters
3. Return top-k results
```

## Performance Benchmarks

### Search Latency
Test conditions: 10k chunks, M1 MacBook Pro / similar x86 system

- Query embedding: 30-100ms (5-20ms if cached)
- Vector search (IVF): 10-50ms
- FTS search: 5-20ms
- Reranking: 50-200ms
- **Total: 100-400ms** (median ~180ms)

Note: Times scale with chunk count and hardware. Large repos (100k+ chunks) may take 500-1000ms.

### Index Creation
- 1k chunks: ~1 second
- 10k chunks: ~10 seconds
- 100k chunks: ~60 seconds

## Memory Usage

### Typical
- Worker idle: ~100MB
- Worker indexing: 500MB - 2GB
- Store connection: ~50MB
- Vector cache: ~40MB (10k entries × 384 dims × 4 bytes)

### Limits
- Worker auto-restart: 6GB RSS
- Cache max entries: 10,000 embeddings

## Common Operations

### Force Re-index
```bash
osgrep index --sync
```

### Clear All Stores
```bash
rm -rf ~/.osgrep/data
```

### Re-download Models
```bash
rm -rf ~/.osgrep/models
osgrep setup
```

### Check Store Health
```bash
osgrep doctor
osgrep list
```

## Debugging

### Enable Profiling
```bash
export OSGREP_PROFILE=1
osgrep search "query"
```

### Check Worker Memory
Look for: `Worker memory usage high (XXXmb). Restarting...`

### Verify Models
```bash
ls -lh ~/.osgrep/models/mixedbread-ai/
```

## Architecture Decisions

### Why 384 dimensions?
- Balance: speed vs expressiveness
- 2x faster than 768-dim models
- Sufficient for code similarity

### Why IVF_FLAT over HNSW?
- Simpler (k-means vs graph)
- Faster indexing
- Lower memory
- 95% recall sufficient

### Why 70/30 blend?
- Reranker more accurate but can be overconfident
- RRF provides regularization
- Empirically tested ratio

### Why 256 minimum for IVF?
- K-means needs sufficient data
- Flat search faster for small datasets
- IVF training cost not worth it below this

## Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Slow search (>1s) | Large repo, no index | Run `osgrep index` |
| OOM crashes | Worker exceeds 6GB | Reduce EMBED_BATCH_SIZE |
| Poor results | Stale index | Re-index with `--sync` |
| Model not found | First run | Wait for download or run `osgrep setup` |

## Further Reading

- [ARCHITECTURE.md](../ARCHITECTURE.md) - Comprehensive deep dive
- [SEARCH_PIPELINE.md](SEARCH_PIPELINE.md) - Visual flow diagram
- [INVESTIGATION_SUMMARY.md](INVESTIGATION_SUMMARY.md) - Executive summary

---

**Last Updated**: 2025-11-23  
**For**: osgrep v0.3.0
