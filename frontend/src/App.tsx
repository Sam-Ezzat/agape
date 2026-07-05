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
import Sidebar from '@/components/Sidebar';
import DashboardPage from '@/pages/DashboardPage';
import AttendeesPage from '@/pages/AttendeesPage';
import CheckInPage from '@/pages/CheckInPage';
import AssignmentsPage from '@/pages/AssignmentsPage';
import AutoAssignmentPage from '@/pages/AutoAssignmentPage';
import HousesPage from '@/pages/HousesPage';
import BuildingsPage from '@/pages/BuildingsPage';
import FloorsPage from '@/pages/FloorsPage';
import RoomsPage from '@/pages/RoomsPage';

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
            
            {/* Check-in/Check-out Interface */}
            <Route path="/check-in" element={<CheckInPage />} />
            
            {/* Room Assignments */}
            <Route path="/assignments" element={<AssignmentsPage />} />
            
            {/* Auto-Assignment - AI-powered automatic room assignment */}
            <Route path="/auto-assignment" element={<AutoAssignmentPage />} />
            
            {/* Infrastructure Management */}
            <Route path="/houses" element={<HousesPage />} />
            <Route path="/buildings" element={<BuildingsPage />} />
            <Route path="/floors" element={<FloorsPage />} />
            <Route path="/rooms" element={<RoomsPage />} />
            
            {/* WHY: Catch-all route redirects to dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
