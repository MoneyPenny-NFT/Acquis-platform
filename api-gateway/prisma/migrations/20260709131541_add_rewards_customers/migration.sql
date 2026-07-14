-- CreateTable
CREATE TABLE "AcquisCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "acquisId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "displayName" TEXT,
    "hederaNftTokenId" TEXT,
    "hederaNftSerial" INTEGER,
    "kycLevel" TEXT NOT NULL DEFAULT 'rewards_only',
    "tier" TEXT NOT NULL DEFAULT 'starter',
    "aqsBalance" INTEGER NOT NULL DEFAULT 0,
    "enrollingMerchantId" TEXT,
    "rewardsConsentGranted" BOOLEAN NOT NULL DEFAULT false,
    "rewardsConsentAt" DATETIME,
    "marketingConsentGranted" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentChannels" TEXT NOT NULL DEFAULT '[]',
    "marketingConsentAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RewardEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "amountCents" INTEGER,
    "rewardUnits" INTEGER NOT NULL,
    "externalRef" TEXT,
    "hcsSequenceNumber" INTEGER,
    "hcsTopicId" TEXT,
    "hederaTxId" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "AcquisCustomer" ("acquisId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AcquisCustomer_acquisId_key" ON "AcquisCustomer"("acquisId");

-- CreateIndex
CREATE UNIQUE INDEX "AcquisCustomer_phone_key" ON "AcquisCustomer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "AcquisCustomer_email_key" ON "AcquisCustomer"("email");

-- CreateIndex
CREATE INDEX "AcquisCustomer_acquisId_idx" ON "AcquisCustomer"("acquisId");

-- CreateIndex
CREATE INDEX "AcquisCustomer_phone_idx" ON "AcquisCustomer"("phone");

-- CreateIndex
CREATE INDEX "AcquisCustomer_email_idx" ON "AcquisCustomer"("email");

-- CreateIndex
CREATE INDEX "RewardEvent_customerId_idx" ON "RewardEvent"("customerId");

-- CreateIndex
CREATE INDEX "RewardEvent_merchantId_idx" ON "RewardEvent"("merchantId");

-- CreateIndex
CREATE INDEX "RewardEvent_createdAt_idx" ON "RewardEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardEvent_merchantId_externalRef_key" ON "RewardEvent"("merchantId", "externalRef");
