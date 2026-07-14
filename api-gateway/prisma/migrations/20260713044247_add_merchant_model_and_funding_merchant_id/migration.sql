-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT,
    "legalName" TEXT NOT NULL,
    "dbaName" TEXT,
    "entityType" TEXT,
    "ein" TEXT,
    "formationState" TEXT,
    "formationDate" DATETIME,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressPostal" TEXT,
    "websiteUrl" TEXT,
    "businessDescription" TEXT,
    "mccCode" TEXT,
    "agreementHash" TEXT,
    "agreementSignedAt" DATETIME,
    "agreementSignedBy" TEXT,
    "hcsAgreementTopicId" TEXT,
    "hcsAgreementSeqNumber" INTEGER,
    "hcsAgreementTxId" TEXT,
    "stripeAccountId" TEXT,
    "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeRequirementsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Backfill: create a Merchant row for every distinct merchantId currently in
-- MerchantConfig (typically 'default' and 'merchant-1'). Uses the existing
-- string as the Merchant.id and slug so downstream FK constraints resolve.
-- legalName is a placeholder that MUST be updated via the merchant CRUD flow
-- before the merchant can sign the service agreement.
INSERT OR IGNORE INTO "Merchant" ("id", "slug", "legalName", "status", "updatedAt")
  SELECT DISTINCT
    mc."merchantId",
    mc."merchantId",
    'Backfilled — legal name pending',
    'pending',
    CURRENT_TIMESTAMP
  FROM "MerchantConfig" mc;

-- Also seed the two well-known slugs even if MerchantConfig is empty on a
-- fresh /tmp DB (macOS wipe on reboot). Guarantees demos have a merchant row.
INSERT OR IGNORE INTO "Merchant" ("id", "slug", "legalName", "status", "updatedAt")
  VALUES
    ('default',    'default',    'Platform Default (fallback row)', 'active', CURRENT_TIMESTAMP),
    ('merchant-1', 'merchant-1', 'Merchant 1 (pilot testnet demo)', 'pending', CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FundingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankAccountId" TEXT NOT NULL,
    "hederaAccountId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL DEFAULT 'default',
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "stripePaymentId" TEXT,
    "hederaTxId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FundingRequest_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FundingRequest" ("amountCents", "bankAccountId", "createdAt", "error", "hederaAccountId", "hederaTxId", "id", "status", "stripePaymentId", "updatedAt") SELECT "amountCents", "bankAccountId", "createdAt", "error", "hederaAccountId", "hederaTxId", "id", "status", "stripePaymentId", "updatedAt" FROM "FundingRequest";
DROP TABLE "FundingRequest";
ALTER TABLE "new_FundingRequest" RENAME TO "FundingRequest";
CREATE INDEX "FundingRequest_hederaAccountId_idx" ON "FundingRequest"("hederaAccountId");
CREATE INDEX "FundingRequest_merchantId_idx" ON "FundingRequest"("merchantId");
CREATE INDEX "FundingRequest_status_idx" ON "FundingRequest"("status");
CREATE INDEX "FundingRequest_stripePaymentId_idx" ON "FundingRequest"("stripePaymentId");
CREATE TABLE "new_MerchantConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "rewardRateBps" INTEGER NOT NULL DEFAULT 100,
    "rewardRateSetBy" TEXT NOT NULL DEFAULT 'platform_default',
    "rewardRateUpdatedAt" DATETIME,
    "webhookSecret" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MerchantConfig_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MerchantConfig" ("createdAt", "id", "merchantId", "rewardRateBps", "rewardRateSetBy", "rewardRateUpdatedAt", "updatedAt", "webhookSecret") SELECT "createdAt", "id", "merchantId", "rewardRateBps", "rewardRateSetBy", "rewardRateUpdatedAt", "updatedAt", "webhookSecret" FROM "MerchantConfig";
DROP TABLE "MerchantConfig";
ALTER TABLE "new_MerchantConfig" RENAME TO "MerchantConfig";
CREATE UNIQUE INDEX "MerchantConfig_merchantId_key" ON "MerchantConfig"("merchantId");
CREATE INDEX "MerchantConfig_merchantId_idx" ON "MerchantConfig"("merchantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_slug_key" ON "Merchant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_ein_key" ON "Merchant"("ein");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_stripeAccountId_key" ON "Merchant"("stripeAccountId");

-- CreateIndex
CREATE INDEX "Merchant_status_idx" ON "Merchant"("status");

-- CreateIndex
CREATE INDEX "Merchant_slug_idx" ON "Merchant"("slug");

-- CreateIndex
CREATE INDEX "Merchant_stripeAccountId_idx" ON "Merchant"("stripeAccountId");
