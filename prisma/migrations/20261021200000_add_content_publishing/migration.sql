-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourcePrompt" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'research_update',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "linkedinContent" TEXT,
    "newsletterContent" TEXT,
    "websiteContent" TEXT,
    "targetChannels" JSONB NOT NULL DEFAULT '["linkedin","newsletter","website"]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingLog" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "publishedUrl" TEXT,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPost_status_idx" ON "ContentPost"("status");

-- CreateIndex
CREATE INDEX "ContentPost_contentType_idx" ON "ContentPost"("contentType");

-- CreateIndex
CREATE INDEX "ContentPost_createdAt_idx" ON "ContentPost"("createdAt");

-- CreateIndex
CREATE INDEX "PublishingLog_postId_idx" ON "PublishingLog"("postId");

-- CreateIndex
CREATE INDEX "PublishingLog_channel_idx" ON "PublishingLog"("channel");

-- CreateIndex
CREATE INDEX "PublishingLog_createdAt_idx" ON "PublishingLog"("createdAt");

-- AddForeignKey
ALTER TABLE "PublishingLog" ADD CONSTRAINT "PublishingLog_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
