import { StatCard } from '../components/StatCard';

export function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Network" value="Testnet" sub="Hedera Hashgraph" />
        <StatCard label="API Gateway" value="http://localhost:3000" sub="api/v1" />
        <StatCard label="Build" value="v0.1.0" sub="hedera-service · api-gateway" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Getting Started</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>Create a Hedera account in the <span className="font-medium">Accounts</span> tab</li>
          <li>Create a token and associate it with your account in <span className="font-medium">Tokens</span></li>
          <li>Move HBAR or tokens in the <span className="font-medium">Transfers</span> tab</li>
        </ol>
      </div>
    </div>
  );
}
