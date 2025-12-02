# Multi-stage Dockerfile for Dashboard Backend API
# Production build with security and optimizations
FROM node:20-alpine AS base
ARG NODE_ENV=production
# Install runtime dependencies needed in all stages (entrypoint + healthcheck)
RUN apk update && apk upgrade && apk add --no-cache dumb-init curl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY package-lock.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS dev
WORKDIR /app

# Install development dependencies
COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY . .
EXPOSE 3001

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]

# Build stage
FROM base AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build the application
RUN npm run build

# Production stage
FROM base AS production
WORKDIR /app

# Install production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package*.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Security headers and optimized startup
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
