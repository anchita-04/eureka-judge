FROM node:22-bookworm-slim

WORKDIR /workspace
RUN corepack enable
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @eureka/api...

COPY apps/api apps/api
RUN pnpm --filter @eureka/api prisma:generate

EXPOSE 3000
CMD ["pnpm", "api:dev"]
