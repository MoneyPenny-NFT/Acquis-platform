-- Add xrplAddress to AcquisCustomer
ALTER TABLE "AcquisCustomer" ADD COLUMN "xrplAddress" TEXT;
CREATE UNIQUE INDEX "AcquisCustomer_xrplAddress_key" ON "AcquisCustomer"("xrplAddress");

-- CreateTable: EnrollmentSession
CREATE TABLE "EnrollmentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chain" TEXT NOT NULL,
    "merchantIdContext" TEXT NOT NULL,
    "capturedWalletAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" DATETIME NOT NULL,
    "scannedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "acquisId" TEXT,
    "credentialTxHash" TEXT,
    "hcsConsentTopicId" TEXT,
    "hcsConsentSeqNumber" INTEGER,
    "consentTextHash" TEXT,
    "consentTextVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "EnrollmentSession_status_idx" ON "EnrollmentSession"("status");
CREATE INDEX "EnrollmentSession_expiresAt_idx" ON "EnrollmentSession"("expiresAt");
CREATE INDEX "EnrollmentSession_merchantIdContext_idx" ON "EnrollmentSession"("merchantIdContext");

-- CreateTable: WatchedMerchantAccount
CREATE TABLE "WatchedMerchantAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lastProcessedTimestampOrLedger" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastPolledAt" DATETIME,
    "lastMatchedTransactionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "WatchedMerchantAccount_merchantId_chain_address_key" ON "WatchedMerchantAccount"("merchantId", "chain", "address");
CREATE INDEX "WatchedMerchantAccount_active_idx" ON "WatchedMerchantAccount"("active");

-- CreateTable: DetectedTransaction
CREATE TABLE "DetectedTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chain" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "senderAddress" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedCustomerAcquisId" TEXT,
    "rewardEventId" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT
);
CREATE UNIQUE INDEX "DetectedTransaction_chain_txHash_key" ON "DetectedTransaction"("chain", "txHash");
CREATE INDEX "DetectedTransaction_recipientAddress_idx" ON "DetectedTransaction"("recipientAddress");
CREATE INDEX "DetectedTransaction_senderAddress_idx" ON "DetectedTransaction"("senderAddress");
CREATE INDEX "DetectedTransaction_status_idx" ON "DetectedTransaction"("status");
CREATE INDEX "DetectedTransaction_detectedAt_idx" ON "DetectedTransaction"("detectedAt");
