/**
 * Root Application Component
 *
 * WHY: Main app component with routing and global layout
 * Sets up React Router for navigation between pages
 * Initializes Socket.io for real-time notifications
 *
 * SOLID Principle: Single Responsibility - Only handles routing and layout
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import AttendeesPage from '@/pages/AttendeesPage';
import CancellationsPage from '@/pages/CancellationsPage';
import CheckInPage from '@/pages/CheckInPage';
import AssignmentsPage from '@/pages/AssignmentsPage';
import AutoAssignmentPage from '@/pages/AutoAssignmentPage';
import AutoAssignmentPreviewPage from '@/pages/AutoAssignmentPreviewPage';
import HousesPage from '@/pages/HousesPage';
import BuildingsPage from '@/pages/BuildingsPage';
import FloorsPage from '@/pages/FloorsPage';
import RoomsPage from '@/pages/RoomsPage';
import WhatsAppSetupPage from '@/pages/WhatsAppSetupPage';
import TemplatesPage from '@/pages/TemplatesPage';
import CampaignsPage from '@/pages/CampaignsPage';
import ProfilePage from '@/pages/ProfilePage';
import UsersPage from '@/pages/UsersPage';

// WHY: Everything behind this wrapper requires an authenticated session —
// unauthenticated visitors are bounced to /login, and the Socket.io
// connection (which the server now rejects without a valid auth cookie)
// only opens once a user is confirmed.
function ProtectedLayout() {
  const { user, loading } = useAuth();
  useSocket(!!user);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content with left margin for sidebar */}
      <main className="flex-1 ml-64 p-8">
        <Routes>
          {/* WHY: Default route redirects to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Dashboard - Overview page */}
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Attendees Management */}
          <Route path="/attendees" element={<AttendeesPage />} />
          <Route path="/attendees/cancellations" element={<CancellationsPage />} />

          {/* Check-in/Check-out Interface */}
          <Route path="/check-in" element={<CheckInPage />} />

          {/* Room Assignments */}
          <Route path="/assignments" element={<AssignmentsPage />} />

          {/* Auto-Assignment - AI-powered automatic room assignment */}
          <Route path="/auto-assignment" element={<AutoAssignmentPage />} />

          {/* Auto-Assignment Preview - Full-page preview results */}
          <Route path="/auto-assignment/preview" element={<AutoAssignmentPreviewPage />} />

          {/* Infrastructure Management */}
          <Route path="/houses" element={<HousesPage />} />
          <Route path="/buildings" element={<BuildingsPage />} />
          <Route path="/floors" element={<FloorsPage />} />
          <Route path="/rooms" element={<RoomsPage />} />

          {/* Communication - WhatsApp & Campaigns */}
          <Route path="/communication/whatsapp" element={<WhatsAppSetupPage />} />
          <Route path="/communication/templates" element={<TemplatesPage />} />
          <Route path="/communication/campaigns" element={<CampaignsPage />} />

          {/* Account & Organization */}
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/users" element={<UsersPage />} />

          {/* WHY: Catch-all route redirects to dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      {/* WHY: Toast notifications for real-time updates and user feedback */}
      <Toaster
          position="top-right"
          reverseOrder={false}
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 4000,
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 6000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
