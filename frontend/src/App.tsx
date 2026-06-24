/**
 * Root Application Component
 * 
 * WHY: Main app component with routing and global layout
 * Sets up React Router for navigation between pages
 * Initializes Socket.io for real-time notifications
 * 
 * SOLID Principle: Single Responsibility - Only handles routing and layout
 */

import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useSocket } from '@/hooks/useSocket';
import DashboardPage from '@/pages/DashboardPage';
import AttendeesPage from '@/pages/AttendeesPage';
import CheckInPage from '@/pages/CheckInPage';
import AssignmentsPage from '@/pages/AssignmentsPage';

function App() {
  // WHY: Initialize Socket.io connection for real-time notifications
  useSocket();

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
      
      <div className="min-h-screen bg-gray-50">
        {/* Header Navigation */}
        <header className="bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-primary-600">
                Agape Conference Management
              </h1>
              <nav className="flex items-center gap-4">
                <Link to="/dashboard" className="text-gray-700 hover:text-primary-600 font-medium">
                  Dashboard
                </Link>
                <Link to="/attendees" className="text-gray-700 hover:text-primary-600 font-medium">
                  Attendees
                </Link>
                <Link to="/check-in" className="text-gray-700 hover:text-primary-600 font-medium">
                  Check-in
                </Link>
                <Link to="/assignments" className="text-gray-700 hover:text-primary-600 font-medium">
                  Assignments
                </Link>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Routes>
            {/* WHY: Default route redirects to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* Dashboard - Overview page */}
            <Route path="/dashboard" element={<DashboardPage />} />
            
            {/* Attendees Management */}
            <Route path="/attendees" element={<AttendeesPage />} />
            
            {/* Check-in/Check-out Interface */}
            <Route path="/check-in" element={<CheckInPage />} />
            
            {/* Room Assignments */}
            <Route path="/assignments" element={<AssignmentsPage />} />
            
            {/* WHY: Catch-all route redirects to dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t mt-auto">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-gray-500">
              © {new Date().getFullYear()} Agape Conference Management. Built with ❤️ for efficient conference management.
            </p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
