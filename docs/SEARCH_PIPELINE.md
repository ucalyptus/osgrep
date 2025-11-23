# osgrep Search Pipeline: Detailed Flow

This document provides a detailed walkthrough of how a search query flows through osgrep's architecture, from user input to displayed results.

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Query                                   │
│                  "where is authentication logic?"                    │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Query Embedding                                   │
│  Transformers.js Worker: "Represent this sentence for searching..." │
│  Output: [0.123, -0.456, 0.789, ...] (384 dimensions)              │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Parallel Search                                    │
│  ┌──────────────────────┐    ┌──────────────────────┐              │
│  │  Vector Search       │    │  Full-Text Search    │              │
│  │  (IVF_FLAT Index)    │    │  (BTree Index)       │              │
│  │  K-means clusters    │    │  "authentication"    │              │
│  │  → Top 200 chunks    │    │  "logic"             │              │
│  └──────────────────────┘    └──────────────────────┘              │
└─────────────────────┬───────────────┬───────────────────────────────┘
                      │               │
                      └───────┬───────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Reciprocal Rank Fusion (RRF)                            │
│  Combine rankings from both searches:                                │
│  - Vector rank 1: file1.ts:45  → score = 1/(60+1) = 0.0164         │
│  - FTS rank 3: file1.ts:45     → score = 1/(60+3) = 0.0159         │
│  - Combined: 0.0164 + 0.0159 = 0.0323                               │
│  Output: Top 50 candidates                                           │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Neural Reranking                                   │
│  Cross-encoder scores query-document pairs:                          │
│  - ("auth logic?", file1.ts content) → 0.89                         │
│  - ("auth logic?", file2.py content) → 0.45                         │
│  Blend: 0.7 × rerank + 0.3 × RRF                                    │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                Context Expansion                                     │
│  For each result, fetch neighboring chunks:                          │
│  - auth.ts:50-60 (matched chunk)                                    │
│  - auth.ts:40-50 (previous chunk)                                   │
│  - auth.ts:60-70 (next chunk)                                       │
│  → Expanded context for display                                      │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Results Formatting                                │
│  Group by file, apply syntax highlighting, show line numbers         │
│  Output: Formatted terminal results                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Insights

1. **IVF (k-means) provides 4-10x speedup** with minimal accuracy loss
2. **Hybrid search** combines vector (semantic) + FTS (keyword) via RRF
3. **Reranking** refines results but accounts for 50% of search time
4. **Performance** is within interactive latency (< 300ms typical)

For detailed stage-by-stage breakdown, see [ARCHITECTURE.md](../ARCHITECTURE.md).
