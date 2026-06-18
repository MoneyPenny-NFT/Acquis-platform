import { PaymentWidget } from '../src/widget/PaymentWidget';
import { AcquisClient } from '../src/AcquisClient';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockOk(body: unknown) {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

const CONFIG = {
  apiBaseUrl: 'http://localhost:3000',
  treasuryAccountId: '0.0.11111',
  treasuryKey: 'mock-key',
  tokenId: '0.0.99999',
};

describe('PaymentWidget', () => {
  let container: HTMLDivElement;
  let client: AcquisClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    client = new AcquisClient(CONFIG);
    mockFetch.mockReset();
  });

  afterEach(() => {
    container.remove();
  });

  it('renders into the provided container element', () => {
    new PaymentWidget(client, { container });
    expect(container.querySelector('.acquis-widget')).not.toBeNull();
    expect(container.querySelector('#acquis-pay')).not.toBeNull();
    expect(container.querySelector('#acquis-amount')).not.toBeNull();
    expect(container.querySelector('#acquis-account')).not.toBeNull();
  });

  it('renders into a CSS selector string', () => {
    container.id = 'pay-root';
    new PaymentWidget(client, { container: '#pay-root' });
    expect(container.querySelector('.acquis-widget')).not.toBeNull();
  });

  it('applies defaultAmount to the amount input', () => {
    new PaymentWidget(client, { container, defaultAmount: 42 });
    const input = container.querySelector<HTMLInputElement>('#acquis-amount')!;
    expect(input.value).toBe('42');
  });

  it('uses custom buttonLabel', () => {
    new PaymentWidget(client, { container, buttonLabel: 'Send Tokens' });
    const btn = container.querySelector<HTMLButtonElement>('#acquis-pay')!;
    expect(btn.textContent?.trim()).toBe('Send Tokens');
  });

  it('shows error status when amount is missing on click', async () => {
    new PaymentWidget(client, { container });
    const btn = container.querySelector<HTMLButtonElement>('#acquis-pay')!;
    btn.click();
    await Promise.resolve();
    const status = container.querySelector<HTMLElement>('#acquis-status')!;
    expect(status.className).toContain('error');
  });

  it('calls onPayment callback with result after successful pay', async () => {
    const onPayment = jest.fn();
    mockOk({ tokenId: '0.0.99999', fromId: '0.0.11111', toId: '0.0.22222', amount: 10 });

    new PaymentWidget(client, { container, onPayment });

    const amountInput = container.querySelector<HTMLInputElement>('#acquis-amount')!;
    const accountInput = container.querySelector<HTMLInputElement>('#acquis-account')!;
    amountInput.value = '10';
    accountInput.value = '0.0.22222';

    container.querySelector<HTMLButtonElement>('#acquis-pay')!.click();
    await new Promise(r => setTimeout(r, 50));

    expect(onPayment).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(container.querySelector<HTMLElement>('#acquis-status')!.className).toContain('success');
  });

  it('unmount() removes the widget from the DOM', () => {
    const widget = new PaymentWidget(client, { container });
    widget.unmount();
    expect(container.querySelector('.acquis-widget')).toBeNull();
  });
});
