import { Link } from 'react-router-dom';

export function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Overview</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">

        <Link
          to="/rewards"
          className="group bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:border-brand-300 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">▦</span>
            <h2 className="text-lg font-semibold text-gray-800 group-hover:text-brand-700 transition-colors">Rewards Program</h2>
          </div>
          <p className="text-sm text-gray-500">
            View AQT issued, active customers, and recent reward events. Issue rewards from the counter screen.
          </p>
          <p className="mt-3 text-xs font-semibold text-brand-600 group-hover:underline">Go to Rewards →</p>
        </Link>

        <Link
          to="/rewards/issue"
          className="group bg-brand-600 rounded-xl shadow-sm p-6 hover:bg-brand-700 transition-all"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">+</span>
            <h2 className="text-lg font-semibold text-white">Issue Reward</h2>
          </div>
          <p className="text-sm text-blue-100">
            Counter screen — quickly credit AQT to a customer by phone number or customer ID.
          </p>
          <p className="mt-3 text-xs font-semibold text-blue-200">Open counter screen →</p>
        </Link>

        <Link
          to="/rewards/enroll"
          className="group bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:border-brand-300 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">✚</span>
            <h2 className="text-lg font-semibold text-gray-800 group-hover:text-brand-700 transition-colors">Enroll Customer</h2>
          </div>
          <p className="text-sm text-gray-500">
            Register a new customer with phone number, record consent to HCS, and mint their AQCID NFT on Hedera testnet.
          </p>
          <p className="mt-3 text-xs font-semibold text-brand-600 group-hover:underline">Enroll →</p>
        </Link>

        <Link
          to="/rewards/settings"
          className="group bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:border-brand-300 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">⚙</span>
            <h2 className="text-lg font-semibold text-gray-800 group-hover:text-brand-700 transition-colors">Program Settings</h2>
          </div>
          <p className="text-sm text-gray-500">
            View reward rate, on-chain token addresses, HCS topic, and Phase roadmap.
          </p>
          <p className="mt-3 text-xs font-semibold text-brand-600 group-hover:underline">Settings →</p>
        </Link>

      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">Network:</span> Hedera Testnet ·{' '}
        <span className="font-semibold text-gray-700">AQT:</span>{' '}
        <a href="https://hashscan.io/testnet/token/0.0.9199123" target="_blank" rel="noreferrer"
           className="text-brand-600 hover:underline">0.0.9199123 ↗</a> ·{' '}
        <span className="font-semibold text-gray-700">HCS:</span>{' '}
        <a href="https://hashscan.io/testnet/topic/0.0.9342744" target="_blank" rel="noreferrer"
           className="text-brand-600 hover:underline">0.0.9342744 ↗</a>
      </div>
    </div>
  );
}
