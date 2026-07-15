// xrpl.js ships src/*.ts alongside dist/*.js and ts-jest walks src/ into
// @noble/hashes ESM which it cannot parse. This mock is only used by api-gateway
// jest runs where the sole import from 'xrpl' is Wallet.fromSeed (in pay.ts's
// x402 branch). Same workaround as xrpl-service/tests/credential.test.ts.
export const Wallet = {
  fromSeed: (seed: string) => ({ address: `rMockWallet_${seed}`, seed }),
};
