# Local synthetic performance baseline

Measured 2026-10-01 on Windows with Docker Desktop PostgreSQL 16 / pgvector 0.8.6, local Node, no paid AI providers. Three sequential samples per operation; warm caches and machine contention affect the result. These are service-level wall times, not network percentiles or a production SLA.

Fixture: 20,000 Copilot Runs, 10,000 evaluations, 2,000 signals, 300 issues, 1,000 tickets, 50 versions and 100 chunks. The replay uses 50 explicit synthetic historical cases and the real execution/storage path.

| Operation | Samples (ms) |
|---|---|
| ticketList | 27.5, 10.4, 7.6 |
| ticketDetail | 9.8, 7.4, 7.2 |
| dashboard | 353.3, 292.3, 254.6 |
| overview | 207, 217.2, 222.4 |
| issues | 28.1, 26.4, 26.6 |
| sources | 241, 237.8, 263.2 |
| runs | 31.6, 27.4, 28.7 |
| hybridProviderFree | 12.9, 6.7, 6.1 |
| versionHistory | 7.5, 4.9, 4.5 |
| outboxEmptyScan | 2.8, 1.1, 1 |
| reconcilePage | 16, 12.8, 14.5 |
| replay50 | 12354.1, 11788.1, 7659.3 |

Source Health was approximately 575–806 ms in the earlier Stage G environment; the present 238–263 ms range is not an isolated causal speedup claim because runtime and cache conditions differ. No speculative cache was added. Dashboard average-first-response now aggregates in SQL instead of hydrating every matching ticket. The inspected CopilotRun date-range count used its organization/createdAt index with zero heap fetches; this does not prove every Source Health join is optimal.

The hybrid entrypoint measurement is provider-free lexical fallback; it does not measure live embedding latency or semantic-provider throughput. Real pgvector behavior is covered by enabled integration tests. Outbox scan is an empty-queue scan, not loaded dispatch throughput; reconciliation reads a bounded 50-version page including legacy-source findings. Ingestion integration tests separately exercise processing, retries and stale fencing.

Reproduce after building API: from apps/api, set NODE_ENV=test, a local disposable DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, empty provider keys and SUPPORTIQ_BENCHMARK=LOCAL_SYNTHETIC; run `node ../../tooling/benchmarks/performance.mjs`. Set SUPPORTIQ_BENCHMARK_OUTPUT outside the source tree to retain JSON. The script adds a uniquely named synthetic tenant, runs real service calls and removes its fixture tenant in finally. Reconciliation can inspect other fixtures in that disposable database; never target important data.
