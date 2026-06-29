# WHY: Dockerfile for frontend production build
# Multi-stage build to minimize final image size

FROM node:18-alpine AS builder

WORKDIR /app

# WHY: Copy package files first for better layer caching
COPY package*.json ./

# WHY: Install dependencies
RUN npm ci

# WHY: Copy source code
COPY . .

# WHY: Build the application
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# WHY: Copy built static files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# WHY: Copy custom nginx configuration for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# WHY: Start nginx
CMD ["nginx", "-g", "daemon off;"]
