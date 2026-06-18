import { Routes, Route } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { Home } from './pages/Home';
import { Cart } from './pages/Cart';
import { BankLink } from './pages/BankLink';
import { Receipt } from './pages/Receipt';
import { Receipts } from './pages/Receipts';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route index element={<Home />} />
        <Route path="cart" element={<Cart />} />
        <Route path="bank-link" element={<BankLink />} />
        <Route path="receipt" element={<Receipt />} />
        <Route path="receipts" element={<Receipts />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
    </SessionProvider>
  );
}
