FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile

# Build shared package first
COPY packages/shared ./packages/shared
RUN pnpm --filter @bpt/shared build

# Build worker
COPY apps/worker ./apps/worker
RUN pnpm --filter @bpt/worker build

CMD ["pnpm", "--filter", "@bpt/worker", "start"]
