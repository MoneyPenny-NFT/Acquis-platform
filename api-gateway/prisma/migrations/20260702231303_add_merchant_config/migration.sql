-- CreateTable
CREATE TABLE "MerchantConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "rewardRateBps" INTEGER NOT NULL DEFAULT 100,
    "rewardRateSetBy" TEXT NOT NULL DEFAULT 'platform_default',
    "rewardRateUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantConfig_merchantId_key" ON "MerchantConfig"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantConfig_merchantId_idx" ON "MerchantConfig"("merchantId");
