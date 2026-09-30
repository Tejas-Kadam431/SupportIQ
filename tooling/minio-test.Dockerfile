# Test-only private S3 service built from the pinned upstream security release.
# Upstream community images are no longer reliably available from Docker Hub.
FROM golang:1.24.9-bookworm AS build
RUN GOBIN=/out go install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z
FROM debian:bookworm-slim
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/minio /usr/local/bin/minio
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data"]
