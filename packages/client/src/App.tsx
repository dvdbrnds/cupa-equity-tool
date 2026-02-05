import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { MainLayout } from './components/layout/MainLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PositionsPage } from './pages/PositionsPage';
import { PositionDetailPage } from './pages/PositionDetailPage';
import { ReviewHistoryPage } from './pages/ReviewHistoryPage';
import { UsersPage } from './pages/UsersPage';
import { ImportPage } from './pages/ImportPage';
import { CupaCatalogPage } from './pages/CupaCatalogPage';
import { VpRolesPage } from './pages/VpRolesPage';
import { LoadingSpinner } from './components/ui/loading-spinner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== 'system_admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function EditorRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const editorRoles = ['system_admin', 'hr_admin'];
  if (!user || !editorRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {/* Dashboard - Equity Analysis Home */}
        <Route index element={<DashboardPage />} />
        
        {/* Position Management */}
        <Route path="positions" element={<PositionsPage />} />
        <Route path="positions/:id" element={<PositionDetailPage />} />
        
        {/* CUPA Catalog */}
        <Route path="cupa-catalog" element={<CupaCatalogPage />} />
        
        {/* Review History */}
        <Route path="history" element={<ReviewHistoryPage />} />
        
        {/* Import (HR only) */}
        <Route path="import" element={<EditorRoute><ImportPage /></EditorRoute>} />
        
        {/* User Management (Admin only) */}
        <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
        
        {/* VP Roles Management (Admin/HR) */}
        <Route path="vp-roles" element={<EditorRoute><VpRolesPage /></EditorRoute>} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
