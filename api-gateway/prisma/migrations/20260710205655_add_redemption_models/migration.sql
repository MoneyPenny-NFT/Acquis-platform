-- CreateTable
CREATE TABLE "RedemptionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "acquisId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "redeemUnits" INTEGER NOT NULL,
    "redeemDisplay" TEXT NOT NULL,
    "valueCents" INTEGER NOT NULL,
    "externalRef" TEXT,
    "hcsSequenceNumber" INTEGER,
    "hcsTopicId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RedemptionEvent_acquisId_fkey" FOREIGN KEY ("acquisId") REFERENCES "AcquisCustomer" ("acquisId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RedemptionCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "redemptionEventId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "usedByMerchantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedemptionCode_redemptionEventId_fkey" FOREIGN KEY ("redemptionEventId") REFERENCES "RedemptionEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RedemptionEvent_acquisId_idx" ON "RedemptionEvent"("acquisId");

-- CreateIndex
CREATE INDEX "RedemptionEvent_merchantId_idx" ON "RedemptionEvent"("merchantId");

-- CreateIndex
CREATE INDEX "RedemptionEvent_status_idx" ON "RedemptionEvent"("status");

-- CreateIndex
CREATE INDEX "RedemptionEvent_createdAt_idx" ON "RedemptionEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionEvent_merchantId_externalRef_key" ON "RedemptionEvent"("merchantId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionCode_code_key" ON "RedemptionCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionCode_redemptionEventId_key" ON "RedemptionCode"("redemptionEventId");

-- CreateIndex
CREATE INDEX "RedemptionCode_code_idx" ON "RedemptionCode"("code");

-- CreateIndex
CREATE INDEX "RedemptionCode_status_idx" ON "RedemptionCode"("status");

-- CreateIndex
CREATE INDEX "RedemptionCode_expiresAt_idx" ON "RedemptionCode"("expiresAt");
