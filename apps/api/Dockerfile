# Build from repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && pnpm config set store-dir /pnpm/store
# Dependencies first, from the manifests alone, so this layer is reused until a dependency changes
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/spec/package.json packages/spec/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @dropboard/api build

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["index.js"]
