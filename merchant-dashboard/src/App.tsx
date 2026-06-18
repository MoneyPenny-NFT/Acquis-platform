import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { Tokens } from './pages/Tokens';
import { Transfers } from './pages/Transfers';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="tokens" element={<Tokens />} />
        <Route path="transfers" element={<Transfers />} />
      </Route>
    </Routes>
  );
}
