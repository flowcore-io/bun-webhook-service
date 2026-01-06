# Multi-stage Docker build for Bun/Hono API

# Builder stage - install all dependencies
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Production stage - only production dependencies
FROM oven/bun:1 AS production

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install only production dependencies
RUN bun install --frozen-lockfile --production

# Copy source code from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the application
CMD ["bun", "run", "src/index.ts"]
