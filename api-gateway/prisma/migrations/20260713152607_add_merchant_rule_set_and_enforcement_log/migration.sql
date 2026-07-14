-- CreateTable: MerchantRuleSet
CREATE TABLE "MerchantRuleSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "hcsTopicId" TEXT NOT NULL,
    "hcsSequenceNumber" INTEGER,
    "hcsTransactionId" TEXT,
    "ruleSetJson" TEXT NOT NULL,
    "effectiveAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MerchantRuleSet_merchantId_version_key" ON "MerchantRuleSet"("merchantId", "version");
CREATE INDEX "MerchantRuleSet_merchantId_idx" ON "MerchantRuleSet"("merchantId");

-- CreateTable: EnforcementLog
CREATE TABLE "EnforcementLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT,
    "approved" BOOLEAN NOT NULL,
    "ruleSetVersion" INTEGER,
    "failedRulesJson" TEXT,
    "hcsSequenceNumber" INTEGER,
    "hcsTopicId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EnforcementLog_merchantId_createdAt_idx" ON "EnforcementLog"("merchantId", "createdAt");
CREATE INDEX "EnforcementLog_customerId_createdAt_idx" ON "EnforcementLog"("customerId", "createdAt");
CREATE INDEX "EnforcementLog_approved_idx" ON "EnforcementLog"("approved");
