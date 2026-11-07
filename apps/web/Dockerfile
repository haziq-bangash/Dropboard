# Build from repo root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && pnpm config set store-dir /pnpm/store
# Dependencies first, from the manifests alone, so this layer is reused until a dependency changes
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/spec/package.json packages/spec/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY packages packages
COPY apps/web apps/web
# Next keeps its compiler cache between builds when the builder keeps this mount
RUN --mount=type=cache,id=next-cache,target=/repo/apps/web/.next/cache pnpm --filter @dropboard/web build

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 8080
CMD ["apps/web/server.js"]
