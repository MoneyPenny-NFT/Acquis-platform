export { getXrplClient, disconnectXrplClient } from './client';
export { getAccountInfo } from './services/account';
export { sendPayment, executeTestnetPayment } from './services/payment';
export { SmartNodeGateway } from './services/smartnode';
export { createCredential, acceptCredential, deleteCredential, configureMerchantPreauth, verifyCredential } from './services/credential';
export { xrpToDrops, dropsToXrp, usdCentsToXrp, xrpToUsdCents, formatXrp, generateDestinationTag } from './utils/currency';

export type { AccountInfo } from './services/account';
export type { SendPaymentParams, PaymentResult, TestnetPaymentRequest } from './services/payment';
export type { SmartNodeConfig, PaymentValidation } from './services/smartnode';
export type { AcquisXRPLCredential, CreateCredentialParams, CreateCredentialResult, VerifyCredentialResult } from './services/credential';
