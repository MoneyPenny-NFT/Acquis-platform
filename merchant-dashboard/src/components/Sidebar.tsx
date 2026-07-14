import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ADMIN_MODE = import.meta.env.VITE_ADMIN_MODE === 'true';

const rewardsLinks = [
  { to: '/rewards',          label: 'Dashboard',      icon: '▦',  end: true  },
  { to: '/rewards/issue',    label: 'Issue Reward',   icon: '+',  end: false },
  { to: '/rewards/customers',label: 'Customers',      icon: '👥', end: false },
  { to: '/rewards/enroll',   label: 'Enroll Customer',icon: '✚',  end: false },
  { to: '/rewards/pos',      label: 'POS Integration',icon: '⚡', end: false },
  { to: '/rewards/settings', label: 'Settings',       icon: '⚙',  end: false },
];

const hederaLinks = [
  { to: '/accounts',  label: 'Accounts',  icon: '👤', end: false },
  { to: '/tokens',    label: 'Tokens',    icon: '🪙', end: false },
  { to: '/transfers', label: 'Transfers', icon: '↔',  end: false },
];

function NavSection({ title, links }: { title: string; links: typeof rewardsLinks }) {
  return (
    <div className="mb-4">
      <p className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
      {links.map(({ to, label, icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <span className="w-4 text-center">{icon}</span>
          {label}
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar() {
  const { email, logout } = useAuth();
  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-100 min-h-screen p-4 flex flex-col">
      <div className="mb-6 px-2">
        <NavLink to="/" className="block">
          <span className="text-xl font-bold text-brand-600">Acquis</span>
          <span className="ml-1 text-xs text-gray-400 align-middle">
            {ADMIN_MODE ? 'Admin' : 'Merchant'}
          </span>
        </NavLink>
      </div>
      <NavSection title="Rewards" links={rewardsLinks} />
      {ADMIN_MODE && <NavSection title="Hedera" links={hederaLinks} />}
      <div className="mt-auto pt-4 border-t border-gray-100">
        <p className="px-3 text-xs text-gray-400 truncate mb-2">{email}</p>
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors">
          Sign out
        </button>
      </div>
    </aside>
  );
}
