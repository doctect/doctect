# Stage 1: Build the frontend
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies (incorporating legacy-peer-deps for better-auth compatibility)
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build frontend
# Build frontend
RUN npm run build

# Stage 2: Production image
FROM node:18-alpine

WORKDIR /app

# Install ONLY production dependencies
COPY package.json package-lock.json ./
RUN npm install --production --legacy-peer-deps

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend source code
COPY server ./server

# Expose port (Cloud Run expects 8080 by default, but we'll stick to env var)
ENV PORT=3001
EXPOSE 3001

# Start the server
CMD ["node", "server/index.js"]
