export class AcquisError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AcquisError';
  }
}

export class NetworkError extends AcquisError {
  constructor(message: string, status?: number) {
    super(message, 'NETWORK_ERROR', status);
    this.name = 'NetworkError';
  }
}

export class ConfigError extends AcquisError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class PaymentError extends AcquisError {
  constructor(message: string) {
    super(message, 'PAYMENT_ERROR');
    this.name = 'PaymentError';
  }
}
