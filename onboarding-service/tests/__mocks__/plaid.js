// Lightweight stub: plaid@42.2.0 takes ~72s to load; this bypasses that entirely.
// The real plaid service is also mocked in onboarding.test.ts, so no plaid methods
// are ever called in tests.
module.exports = {
  Configuration: function Configuration() {},
  PlaidApi: function PlaidApi() { return {}; },
  PlaidEnvironments: { sandbox: 'https://sandbox.plaid.com/v1' },
  Products: { Auth: 'auth', Identity: 'identity' },
  CountryCode: { Us: 'US' },
  IdentityVerificationStatus: { Success: 'success' },
};
