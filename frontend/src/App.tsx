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
            <h1 className="text-2xl font-bold text-primary-600">
              Agape Conference Management
            </h1>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Routes>
            {/* WHY: Default route shows welcome page */}
            <Route path="/" element={<HomePage />} />
            
            {/* TODO: Add routes as we build pages */}
            {/* <Route path="/attendees" element={<AttendeesPage />} /> */}
            {/* <Route path="/rooms" element={<RoomsPage />} /> */}
            {/* <Route path="/assignments" element={<AssignmentsPage />} /> */}
            {/* <Route path="/dashboard" element={<DashboardPage />} /> */}
            
            {/* WHY: Catch-all route redirects to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
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

/**
 * Home Page Component
 * WHY: Temporary landing page until we build the full dashboard
 */
function HomePage() {
  return (
    <div className="card max-w-2xl mx-auto">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Welcome to Agape Conference Management
        </h2>
        <p className="text-gray-600 mb-6">
          Comprehensive accommodation management system for large conferences (1000-5000 attendees)
          across multiple buildings, floors, and rooms.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          <div className="p-4 bg-primary-50 rounded-lg">
            <h3 className="font-semibold text-primary-900 mb-2">🏢 Hierarchical Structure</h3>
            <p className="text-sm text-primary-700">
              Manage conference house → buildings → floors → rooms
            </p>
          </div>
          
          <div className="p-4 bg-primary-50 rounded-lg">
            <h3 className="font-semibold text-primary-900 mb-2">👥 Attendee Management</h3>
            <p className="text-sm text-primary-700">
              Import from Excel, manage profiles, assign roles
            </p>
          </div>
          
          <div className="p-4 bg-primary-50 rounded-lg">
            <h3 className="font-semibold text-primary-900 mb-2">🎯 Drag & Drop</h3>
            <p className="text-sm text-primary-700">
              Intuitive room assignment with real-time validation
            </p>
          </div>
          
          <div className="p-4 bg-primary-50 rounded-lg">
            <h3 className="font-semibold text-primary-900 mb-2">✅ Check-in Tracking</h3>
            <p className="text-sm text-primary-700">
              Monitor arrivals and occupancy in real-time
            </p>
          </div>
        </div>
        
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>⚠️ Under Development:</strong> The system is being built. Features will be added progressively.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
