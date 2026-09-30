# Known limitations and bounded future work

- Human feedback is incomplete and not factual ground truth; synthetic evaluation fixtures are limited.
- Live providers are nondeterministic. Mock/no-key tests do not establish live accuracy or throughput.
- Conflict detection is conservative, and lexical-only operation has weaker semantic recall.
- Replay is bounded synchronous work. Interrupted experiments require an operator action; it is not a distributed evaluation scheduler.
- Horizontal Socket.IO deployment needs a shared adapter; current room state is local.
- Organization locks simplify correctness but serialize mutation throughput within a tenant.
- Offset history pages have stable tie-breaking, but concurrent inserts can shift page boundaries; they are not immutable browsing snapshots.
- Private S3/IAM, TLS, proxy trust, backups and legacy-source imports must be checked in the target environment.
- No malware scanner, SSO or compliance certification. PDF native allocations are not fully covered by V8 heap limits.
- Outbox/worker volume has not been validated at enterprise scale. Process counters need a log collector for durable cross-process aggregation.
- Orphan cleanup is report-only. Identical-byte model-only reindexing needs a reviewed future workflow.
- The existing client bundle warning and ts-jest/compiler support warning are tracked; passing checks do not erase toolchain warnings.

Future work is limited to five optional directions: broader real-world evaluation data; stronger content/injection review; a shared realtime adapter when horizontal deployment is required; reviewed reindex/object-retention tooling; identity-provider integration if a real customer requires it. None is required to add another flagship feature.

## Name

Keep SupportIQ. It is descriptive and already consistent across code, seeded accounts and deployment references. A rebrand adds migration and link-maintenance cost without improving the engineering demonstration. This is a product recommendation, not a trademark or domain-availability claim. No rename was performed.
