# Multi-stage build for Ashtrail dev-tools
# Stage 1: Build Rust backend
FROM rust:1.83-slim as rust-builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace files
COPY packages/geo-core ./packages/geo-core
COPY packages/worldgen-core ./packages/worldgen-core
COPY apps/dev-tools/backend ./apps/dev-tools/backend

# Build the Rust backend
WORKDIR /app/apps/dev-tools/backend
RUN cargo build --release

# Stage 2: Build frontend with Bun
FROM oven/bun:1 as frontend-builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY packages/core ./packages/core
COPY packages/ui ./packages/ui
COPY packages/geo-wasm ./packages/geo-wasm
COPY apps/dev-tools ./apps/dev-tools
COPY tailwind.config.js postcss.config.js tsconfig.json ./

# Install dependencies
RUN bun install

# Build frontend
WORKDIR /app/apps/dev-tools
RUN bun run build

# Stage 3: Runtime
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy Rust backend binary
COPY --from=rust-builder /app/apps/dev-tools/backend/target/release/dev-tools-backend /app/backend

# Copy frontend build
COPY --from=frontend-builder /app/apps/dev-tools/dist /app/dist

# Copy generated assets if they exist
COPY --from=frontend-builder /app/apps/dev-tools/generated /app/generated

# Set environment variables
ENV RUST_LOG=info
ENV PORT=8080

# Expose port
EXPOSE 8080

# Run the backend (which serves the frontend)
CMD ["/app/backend"]
