# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/
COPY packages/client/package*.json ./packages/client/

# Install dependencies
RUN npm ci

# Copy source files
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/
COPY packages/client/ ./packages/client/

# Build all packages
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/

RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
