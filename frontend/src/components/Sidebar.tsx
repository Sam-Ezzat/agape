/**
 * Sidebar Navigation Component
 * 
 * WHY: Provides easy navigation between all sections of the app
 */

import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  ClipboardCheck, 
  BedDouble, 
  Zap,
  Home, 
  Building2, 
  Layers, 
  DoorOpen 
} from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/attendees', icon: Users, label: 'Attendees' },
    { path: '/check-in', icon: ClipboardCheck, label: 'Check-in' },
    { path: '/assignments', icon: BedDouble, label: 'Assignments' },
    { path: '/auto-assignment', icon: Zap, label: 'Auto-Assignment' },
    { path: '/houses', icon: Home, label: 'Houses' },
    { path: '/buildings', icon: Building2, label: 'Buildings' },
    { path: '/floors', icon: Layers, label: 'Floors' },
    { path: '/rooms', icon: DoorOpen, label: 'Rooms' },
  ];
  
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 shadow-sm overflow-y-auto">
      <div className="p-6">
        <h1 className="text-xl font-bold text-primary-600">
          Agape Conference
        </h1>
        <p className="text-xs text-gray-500 mt-1">Management System</p>
      </div>
      
      <nav className="px-3 pb-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg transition-colors ${
                active
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
