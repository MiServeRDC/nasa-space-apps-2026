# Build locally/self-hosted; never trigger hosted Actions for this project.
ARG NODE_IMAGE=node:26-bookworm-slim
ARG RUST_IMAGE=rust:1.98-bookworm
FROM ${NODE_IMAGE} AS cockpit
WORKDIR /build
COPY ares-cockpit/package.json ares-cockpit/package-lock.json ./ares-cockpit/
RUN npm --prefix ares-cockpit ci --ignore-scripts --no-audit --no-fund
COPY ares-cockpit/ ./ares-cockpit/
COPY scripts/collect_release_notices.mjs ./scripts/
RUN VITE_ARES_HTTP_URL= VITE_ARES_WS_URL= npm --prefix ares-cockpit run build \
 && node scripts/collect_release_notices.mjs --npm-only --out ares-cockpit/dist/third-party/npm

FROM ${RUST_IMAGE} AS engine
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
COPY vendor/ ./vendor/
COPY contracts/ ./contracts/
COPY data/bidmc/ ./data/bidmc/
COPY scripts/collect_release_notices.mjs scripts/verify_lancedb_vendor.py ./scripts/
COPY docs/dependencies/lancedb-0.40.0-* ./docs/dependencies/
COPY --from=cockpit /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install --no-install-recommends -y python3 \
 && python3 scripts/verify_lancedb_vendor.py \
 && cargo build --release --locked -p ares-server-cli --bin ares-server-cli \
 && node scripts/collect_release_notices.mjs --rust-only --out /notices

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin ares
WORKDIR /app
COPY --from=engine /build/target/release/ares-server-cli ./bin/ares-server-cli
COPY --from=cockpit /build/ares-cockpit/dist ./frontend
COPY --from=engine /notices ./frontend/third-party/rust
COPY data/bidmc/ ./data/bidmc/
COPY LICENSE LICENSE-APACHE ./
COPY deploy/judges/start-server.sh ./start-server.sh
RUN chmod 755 start-server.sh
USER 10001:10001
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
 CMD curl --fail --silent "http://127.0.0.1:${PORT}/healthz" || exit 1
ENTRYPOINT ["/app/start-server.sh"]
