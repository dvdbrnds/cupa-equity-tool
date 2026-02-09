import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { MainLayout } from './components/layout/MainLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { VPReviewPage } from './pages/VPReviewPage';
import { DivisionDetailPage } from './pages/DivisionDetailPage';
import { PositionsPage } from './pages/PositionsPage';
import { PositionDetailPage } from './pages/PositionDetailPage';
import { ReviewHistoryPage } from './pages/ReviewHistoryPage';
import { ReviewCyclesPage } from './pages/ReviewCyclesPage';
import { ReviewCycleDetailPage } from './pages/ReviewCycleDetailPage';
import { UsersPage } from './pages/UsersPage';
// ImportPage removed -- uploads are now inline in the SetupChecklist on the Dashboard
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
        {/* Dashboard - role-aware landing page */}
        <Route index element={<DashboardPage />} />
        
        {/* VP Review - purpose-built review task interface */}
        <Route path="review" element={<VPReviewPage />} />
        
        {/* Division Detail - drill-down view for a single VP division */}
        <Route path="divisions/:vp" element={<DivisionDetailPage />} />
        
        {/* Position Management */}
        <Route path="positions" element={<PositionsPage />} />
        <Route path="positions/:id" element={<PositionDetailPage />} />
        
        {/* CUPA Catalog */}
        <Route path="cupa-catalog" element={<CupaCatalogPage />} />
        
        {/* Review History */}
        <Route path="history" element={<ReviewHistoryPage />} />
        
        {/* Review Cycles (HR workflow) */}
        <Route path="review-cycles" element={<EditorRoute><ReviewCyclesPage /></EditorRoute>} />
        <Route path="review-cycles/:id" element={<EditorRoute><ReviewCycleDetailPage /></EditorRoute>} />
        
        {/* Import -- redirects to dashboard (uploads are now inline) */}
        <Route path="import" element={<Navigate to="/" replace />} />
        
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
