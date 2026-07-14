import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { Tokens } from './pages/Tokens';
import { Transfers } from './pages/Transfers';
import { RewardsDashboard } from './pages/rewards/RewardsDashboard';
import { IssueReward } from './pages/rewards/IssueReward';
import { Customers } from './pages/rewards/Customers';
import { EnrollCustomer } from './pages/rewards/EnrollCustomer';
import { ProgramSettings } from './pages/rewards/ProgramSettings';
import { PosIntegration } from './pages/rewards/PosIntegration';

const ADMIN_MODE = import.meta.env.VITE_ADMIN_MODE === 'true';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />

        {/* Rewards */}
        <Route path="rewards"                      element={<RewardsDashboard />} />
        <Route path="rewards/issue"                element={<IssueReward />} />
        <Route path="rewards/customers"            element={<Customers />} />
        <Route path="rewards/customers/:customerId" element={<Customers />} />
        <Route path="rewards/enroll"               element={<EnrollCustomer />} />
        <Route path="rewards/pos"                  element={<PosIntegration />} />
        <Route path="rewards/settings"             element={<ProgramSettings />} />

        {/* Hedera ops — admin only */}
        <Route path="accounts"  element={ADMIN_MODE ? <Accounts />  : <Navigate to="/" replace />} />
        <Route path="tokens"    element={ADMIN_MODE ? <Tokens />    : <Navigate to="/" replace />} />
        <Route path="transfers" element={ADMIN_MODE ? <Transfers /> : <Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
