import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.tsx';
import { Layout } from './components/Layout.tsx';
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard.tsx';
import Assignments from './pages/Assignments.tsx';
import ImportPage from './pages/ImportPage.tsx';
import Receipts from './pages/Receipts.tsx';
import Reports from './pages/Reports.tsx';
import Settings from './pages/Settings.tsx';
import FlagsAdmin from './pages/FlagsAdmin.tsx';

function AppRoutes() {
  const { user, ready } = useAuth();
  const isAdmin = user?.is_admin === 1;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" className="opacity-25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
          </svg>
          <span className="text-sm">JDS Sports lädt …</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/einsaetze" element={<Assignments />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/quittungen" element={<Receipts />} />
        <Route path="/auswertung" element={<Reports />} />
        <Route path="/einstellungen" element={<Settings />} />
        {isAdmin && <Route path="/flags" element={<FlagsAdmin />} />}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
