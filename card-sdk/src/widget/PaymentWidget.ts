import { STYLES } from './styles';
import type { AcquisClient } from '../AcquisClient';
import type { WidgetOptions, PaymentResult } from '../types';

export class PaymentWidget {
  private root!: HTMLElement;
  private input!: HTMLInputElement;
  private accountInput!: HTMLInputElement;
  private button!: HTMLButtonElement;
  private status!: HTMLElement;

  constructor(
    private readonly client: AcquisClient,
    private readonly options: WidgetOptions,
  ) {
    this.mount();
  }

  private mount() {
    injectStyleOnce(STYLES);

    const container = typeof this.options.container === 'string'
      ? document.querySelector<HTMLElement>(this.options.container)
      : this.options.container;

    if (!container) throw new Error(`Widget container not found: ${this.options.container}`);

    this.root = document.createElement('div');
    this.root.className = 'acquis-widget';
    this.root.innerHTML = `
      <p class="acquis-title">Acquis Payment</p>
      <div class="acquis-field">
        <label class="acquis-label">To Account ID</label>
        <input class="acquis-input" id="acquis-account" placeholder="0.0.XXXXX" />
      </div>
      <div class="acquis-field">
        <label class="acquis-label">Amount</label>
        <input class="acquis-input" id="acquis-amount" type="number" min="0"
               placeholder="${this.options.defaultAmount ?? '0'}" />
      </div>
      <button class="acquis-btn" id="acquis-pay">
        ${this.options.buttonLabel ?? 'Pay Now'}
      </button>
      <div class="acquis-status" id="acquis-status"></div>
    `;

    container.appendChild(this.root);

    this.input = this.root.querySelector<HTMLInputElement>('#acquis-amount')!;
    this.accountInput = this.root.querySelector<HTMLInputElement>('#acquis-account')!;
    this.button = this.root.querySelector<HTMLButtonElement>('#acquis-pay')!;
    this.status = this.root.querySelector<HTMLElement>('#acquis-status')!;

    if (this.options.defaultAmount) {
      this.input.value = String(this.options.defaultAmount);
    }

    this.button.addEventListener('click', () => this.handlePay());
  }

  private async handlePay() {
    const amount = parseFloat(this.input.value);
    const toAccountId = this.accountInput.value.trim();

    if (!toAccountId || isNaN(amount) || amount <= 0) {
      this.showStatus('error', 'Enter a valid account ID and amount');
      return;
    }

    this.setLoading(true);
    this.clearStatus();

    const result = await this.client.tryPay({ toAccountId, amount });
    this.handleResult(result);
    this.setLoading(false);
  }

  private handleResult(result: PaymentResult) {
    if (result.success) {
      this.showStatus('success', `Payment of ${result.transfer?.amount} sent to ${result.transfer?.toId}`);
      this.input.value = '';
      this.accountInput.value = '';
    } else {
      this.showStatus('error', result.error ?? 'Payment failed');
    }
    this.options.onPayment?.(result);
  }

  private setLoading(loading: boolean) {
    this.button.disabled = loading;
    this.button.textContent = loading ? 'Processing…' : (this.options.buttonLabel ?? 'Pay Now');
  }

  private showStatus(type: 'success' | 'error', message: string) {
    this.status.textContent = message;
    this.status.className = `acquis-status visible ${type}`;
  }

  private clearStatus() {
    this.status.className = 'acquis-status';
    this.status.textContent = '';
  }

  unmount() {
    this.root.remove();
  }
}

function injectStyleOnce(css: string) {
  const id = 'acquis-sdk-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
