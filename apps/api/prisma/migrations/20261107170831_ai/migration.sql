-- CreateTable
CREATE TABLE "ai_cache" (
    "key" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ai_generation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cached" BOOLEAN NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_generation_userId_createdAt_idx" ON "ai_generation"("userId", "createdAt");
