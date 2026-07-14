import { useState } from 'react';
import { api, type CreditRewardResult } from '../../api/client';

const MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID ?? 'merchant-1';
const HCS_TOPIC   = '0.0.9342744';

type EventType = 'purchase' | 'checkin' | 'referral' | 'signup_bonus' | 'manual_credit';

const EVENT_TYPES: { value: EventType; label: string; usesAmount: boolean }[] = [
  { value: 'purchase',      label: 'Purchase',      usesAmount: true  },
  { value: 'checkin',       label: 'Check-In',      usesAmount: false },
  { value: 'referral',      label: 'Referral',      usesAmount: false },
  { value: 'signup_bonus',  label: 'Sign-Up Bonus', usesAmount: false },
  { value: 'manual_credit', label: 'Manual Credit', usesAmount: false },
];

export function IssueReward() {
  const [customerInput, setCustomerInput] = useState('');
  const [inputType,     setInputType]     = useState<'id' | 'phone'>('phone');
  const [eventType,     setEventType]     = useState<EventType>('purchase');
  const [amountDollars, setAmountDollars] = useState('');
  const [fixedUnits,    setFixedUnits]    = useState('');
  const [externalRef,   setExternalRef]   = useState('');
  const [loading,       setLoading]       = useState(false);
  const [result,        setResult]        = useState<CreditRewardResult | null>(null);
  const [error,         setError]         = useState<string | null>(null);

  const selected = EVENT_TYPES.find(e => e.value === eventType)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const amountCents = selected.usesAmount ? Math.round(parseFloat(amountDollars) * 100) : undefined;
      const units       = !selected.usesAmount ? parseInt(fixedUnits, 10) : undefined;

      const body: Parameters<typeof api.creditReward>[0] = {
        merchantId: MERCHANT_ID,
        eventType,
        ...(externalRef ? { externalRef } : {}),
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(units !== undefined ? { fixedRewardUnits: units } : {}),
        ...(inputType === 'id'
          ? { customerId: customerInput }
          : { customerContact: { phone: customerInput } }),
      };

      const data = await api.creditReward(body);
      setResult(data);
      // reset form for next transaction
      setCustomerInput('');
      setAmountDollars('');
      setFixedUnits('');
      setExternalRef('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Issue Reward</h1>
      <p className="text-sm text-gray-500 mb-8">Counter screen — merchant <code className="text-xs bg-gray-100 px-1 rounded">{MERCHANT_ID}</code></p>

      {/* Success result */}
      {result && (
        <div className="mb-8 bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
          <p className="text-5xl font-extrabold text-green-700 mb-2">{result.rewardDisplay}</p>
          <p className="text-lg text-green-600 font-semibold mb-1">earned!</p>
          <p className="text-sm text-gray-600 mt-4">
            New balance: <span className="font-semibold">{(result.customerBalance / 100).toFixed(2)} AQT</span>
          </p>
          {result.hcsSequenceNumber != null && (
            <a
              href={`https://hashscan.io/testnet/topic/${HCS_TOPIC}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 text-xs text-green-600 hover:underline"
            >
              HCS seq {result.hcsSequenceNumber} ↗
            </a>
          )}
          {result.rewardUnits === 0 && (
            <p className="text-xs text-gray-400 mt-2">Purchase too small to earn a full unit — no transfer issued.</p>
          )}
          <button
            onClick={handleReset}
            className="mt-6 px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
          >
            Next Transaction
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex justify-between items-start">
          <span>{error}</span>
          <button onClick={handleReset} className="ml-4 text-red-500 hover:text-red-700 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Form */}
      {!result && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">

          {/* Customer identifier */}
          <div>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setInputType('phone')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${inputType === 'phone' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Phone
              </button>
              <button
                type="button"
                onClick={() => setInputType('id')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${inputType === 'id' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Customer ID
              </button>
            </div>
            <input
              type={inputType === 'phone' ? 'tel' : 'text'}
              value={customerInput}
              onChange={e => setCustomerInput(e.target.value)}
              placeholder={inputType === 'phone' ? '+1 (555) 000-0000' : 'acq_xxxxxxxx'}
              required
              className="w-full text-lg px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Event type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Event Type</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EVENT_TYPES.map(et => (
                <button
                  key={et.value}
                  type="button"
                  onClick={() => setEventType(et.value)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    eventType === et.value
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                  }`}
                >
                  {et.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount or fixed units */}
          {selected.usesAmount ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-gray-400">$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amountDollars}
                  onChange={e => setAmountDollars(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full text-2xl font-bold pl-9 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {amountDollars && !isNaN(parseFloat(amountDollars)) && (
                <p className="mt-1 text-xs text-gray-400">
                  ≈ {Math.floor(parseFloat(amountDollars) * 100 * 100 / 10000)} AQT units at 100 bps
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fixed Reward Units</label>
              <input
                type="number"
                min="1"
                step="1"
                value={fixedUnits}
                onChange={e => setFixedUnits(e.target.value)}
                placeholder="25"
                required
                className="w-full text-2xl font-bold px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {fixedUnits && !isNaN(parseInt(fixedUnits)) && (
                <p className="mt-1 text-xs text-gray-400">
                  = {(parseInt(fixedUnits) / 100).toFixed(2)} AQT
                </p>
              )}
            </div>
          )}

          {/* External ref (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reference <span className="text-gray-400 font-normal">(optional — POS receipt #)</span>
            </label>
            <input
              type="text"
              value={externalRef}
              onChange={e => setExternalRef(e.target.value)}
              placeholder="POS-12345"
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-brand-600 text-white text-lg font-bold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Issuing…' : 'Issue Reward'}
          </button>
        </form>
      )}
    </div>
  );
}
