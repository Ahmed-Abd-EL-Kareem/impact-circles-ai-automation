-- CreateTable
CREATE TABLE "SandboxPublication" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "content" JSONB NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SandboxPublication_channel_idx" ON "SandboxPublication"("channel");

-- CreateIndex
CREATE INDEX "SandboxPublication_slug_idx" ON "SandboxPublication"("slug");

-- CreateIndex
CREATE INDEX "SandboxPublication_createdAt_idx" ON "SandboxPublication"("createdAt");
