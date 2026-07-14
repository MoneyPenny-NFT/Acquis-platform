import { useEffect } from 'react';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';

const MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID ?? 'merchant-1';
const HCS_TOPIC   = '0.0.9342744';
const AQT_TOKEN   = '0.0.9199123';
const NFT_TOKEN   = '0.0.9342217';

function Row({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <span className="text-sm text-gray-900 font-mono">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
            {value} ↗
          </a>
        ) : value}
      </span>
    </div>
  );
}

export function ProgramSettings() {
  const summary = useApi<ReturnType<typeof api.getRewardsSummary> extends Promise<infer T> ? T : never>();

  useEffect(() => {
    summary.execute(() => api.getRewardsSummary(MERCHANT_ID));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Program Settings</h1>
      <p className="text-sm text-gray-500 mb-8">Read-only — rate configuration is Phase 3.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Merchant config */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Merchant</h2>
          <Row label="Merchant ID" value={MERCHANT_ID} />
          <Row label="Network" value="Hedera Testnet" />
          <Row label="API Gateway" value="localhost:3000" />
          <Row label="Status" value={summary.data ? 'Connected' : summary.loading ? 'Connecting…' : 'Offline'} />
        </div>

        {/* Reward program */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Reward Program</h2>
          <Row label="Reward Rate" value="100 bps (1%)" />
          <Row label="Rate Source" value="Platform default" />
          <Row label="Model" value="Model A — earn only" />
          <Row label="Redemption Rate" value="1 unit = $0.01" />
        </div>

        {/* On-chain config */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">On-Chain Configuration</h2>
          <Row
            label="AQT Token"
            value={AQT_TOKEN}
            link={`https://hashscan.io/testnet/token/${AQT_TOKEN}`}
          />
          <Row
            label="AQCID NFT Collection"
            value={NFT_TOKEN}
            link={`https://hashscan.io/testnet/token/${NFT_TOKEN}`}
          />
          <Row
            label="HCS Topic"
            value={HCS_TOPIC}
            link={`https://hashscan.io/testnet/topic/${HCS_TOPIC}`}
          />
          <Row
            label="Operator Account"
            value="0.0.9186941"
            link="https://hashscan.io/testnet/account/0.0.9186941"
          />
        </div>

        {/* Summary snapshot */}
        {summary.data && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Live Snapshot</h2>
            <Row label="Active Customers" value={String(summary.data.activeCustomers)} />
            <Row label="Issued This Month" value={(summary.data.issuedMonth / 100).toFixed(2) + ' AQT'} />
            <Row label="Outstanding" value={(summary.data.totalOutstanding / 100).toFixed(2) + ' AQT'} />
          </div>
        )}

        {/* Phase roadmap */}
        <div className="lg:col-span-2 bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Roadmap</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-sm">
            {[
              { phase: 'Phase 1',  label: 'Standalone Rewards API',      done: true  },
              { phase: 'Phase 2',  label: 'Merchant Portal (this view)', done: true  },
              { phase: 'Phase 3',  label: 'POS Integration + Rate Config', done: false },
              { phase: 'Phase 4a', label: 'Customer Redemption',         done: true  },
              { phase: 'Phase 4b', label: 'Network Optionality',         done: false },
            ].map(item => (
              <div key={item.phase} className={`rounded-lg p-4 border ${item.done ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                <p className={`text-xs font-semibold mb-1 ${item.done ? 'text-green-700' : 'text-gray-400'}`}>
                  {item.done ? '✓ ' : ''}{item.phase}
                </p>
                <p className={`text-sm ${item.done ? 'text-green-800' : 'text-gray-500'}`}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
