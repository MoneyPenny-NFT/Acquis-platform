-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "externalRef" TEXT,
    "amountCents" INTEGER,
    "customerContact" TEXT,
    "customerId" TEXT,
    "rewardEventId" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WebhookEvent_merchantId_idx" ON "WebhookEvent"("merchantId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_merchantId_externalRef_key" ON "WebhookEvent"("merchantId", "externalRef");
