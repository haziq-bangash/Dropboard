# Build from repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @dropboard/api build

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["index.js"]
