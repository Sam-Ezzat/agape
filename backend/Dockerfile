# WHY: Dockerfile for backend production build
# Multi-stage build to minimize final image size

FROM node:18-alpine AS builder

WORKDIR /app

# WHY: Copy package files first for better layer caching
COPY package*.json ./
COPY prisma ./prisma/

# WHY: Install dependencies including dev dependencies for build
RUN npm ci

# WHY: Copy source code
COPY . .

# WHY: Generate Prisma client and build TypeScript
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# WHY: Copy only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# WHY: Copy Prisma schema for client generation
COPY prisma ./prisma/
RUN npx prisma generate

# WHY: Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# WHY: Run as non-root user for security
USER node

EXPOSE 3000

# WHY: Start the production server
CMD ["node", "dist/server.js"]
