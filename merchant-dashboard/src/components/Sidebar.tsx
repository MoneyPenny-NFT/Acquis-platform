import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/accounts', label: 'Accounts', icon: '👤' },
  { to: '/tokens', label: 'Tokens', icon: '🪙' },
  { to: '/transfers', label: 'Transfers', icon: '↔' },
];

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-100 min-h-screen p-4 flex flex-col gap-1">
      <div className="mb-6 px-2">
        <span className="text-xl font-bold text-brand-600">Acquis</span>
        <span className="ml-1 text-xs text-gray-400 align-middle">Merchant</span>
      </div>
      {links.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <span>{icon}</span>
          {label}
        </NavLink>
      ))}
    </aside>
  );
}
