import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { EditorPage } from './pages/EditorPage';
import { DocsPage } from './pages/DocsPage';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';
import { LoginPage } from './pages/LoginPage';
import { GalleryPage } from './pages/GalleryPage';
import { GalleryDetailPage } from './pages/GalleryDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { MergeRequestPage } from './pages/MergeRequestPage';
import { WelcomePage } from './pages/WelcomePage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { trackEvent } from './services/analytics';
import { useSession } from './lib/auth-client';
import { Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <PageTracker />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<EditorPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/gallery/:id" element={<GalleryDetailPage />} />
        <Route path="/u/:username" element={<ProfilePage />} />
        <Route path="/mr/:id" element={<MergeRequestPage />} />
        <Route
          path="/analytics"
          element={
            <AuthGuard>
              <AnalyticsDashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/welcome"
          element={
            <AuthGuard>
              <WelcomePage />
            </AuthGuard>
          }
        />
        <Route
          path="/account"
          element={
            <AuthGuard>
              <AccountSettingsPage />
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function PageTracker() {
  const location = useLocation();
  React.useEffect(() => {
    trackEvent('page_view', { path: location.pathname });
  }, [location]);
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending, error } = useSession();
  const location = useLocation();

  if (isPending) return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} />;
  }

  // Optional: Check strictly for admin role if the backend enforces it, 
  // but the backend will return 403 if not admin, so the dashboard will likely show an error.
  // For better UX, we can check here too.
  /*
  if (session.user.role !== 'admin') {
      return <div className="p-8 text-center text-red-600">Access Denied. Admins only.</div>;
  }
  */

  return <>{children}</>;
}

export default App;