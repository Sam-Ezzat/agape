/**
 * Sidebar Navigation Component
 *
 * WHY: Provides easy navigation between all sections of the app
 */

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  BedDouble,
  Zap,
  Home,
  Building2,
  Layers,
  DoorOpen,
  MessageCircle,
  FileText,
  Send,
  ChevronDown,
  LogOut,
  PieChart,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface NavChild {
  path: string;
  icon: typeof MessageCircle;
  label: string;
}

interface NavItem {
  path?: string;
  icon: typeof MessageCircle;
  label: string;
  children?: NavChild[];
}

// WhatsApp/communication needs headless Chrome, which can OOM the
// production Render plan if it's on a low memory tier - see
// WHATSAPP_TROUBLESHOOTING.md if it crashes there.
const COMMUNICATION_ENABLED = true;

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  // WHY: Conference House Managers are restricted to a single page (also
  // enforced by a route redirect in App.tsx) — the sidebar mirrors that by
  // showing nothing else.
  const navItems: NavItem[] =
    user?.role === 'CONFERENCE_HOUSE_MANAGER'
      ? [{ path: '/building-capacity', icon: PieChart, label: 'Building Capacity' }]
      : [
          { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
          { path: '/attendees', icon: Users, label: 'Attendees' },
          { path: '/check-in', icon: ClipboardCheck, label: 'Check-in' },
          { path: '/assignments', icon: BedDouble, label: 'Assignments' },
          { path: '/auto-assignment', icon: Zap, label: 'Auto-Assignment' },
          { path: '/houses', icon: Home, label: 'Houses' },
          {
            icon: Building2,
            label: 'Buildings',
            children: [
              { path: '/buildings', icon: Building2, label: 'Buildings' },
              { path: '/building-capacity', icon: PieChart, label: 'Building Capacity' },
            ],
          } satisfies NavItem,
          { path: '/floors', icon: Layers, label: 'Floors' },
          { path: '/rooms', icon: DoorOpen, label: 'Rooms' },
          ...(COMMUNICATION_ENABLED
            ? [
                {
                  icon: MessageCircle,
                  label: 'WhatsApp',
                  children: [
                    { path: '/communication/whatsapp', icon: MessageCircle, label: 'WhatsApp Setup' },
                    { path: '/communication/templates', icon: FileText, label: 'Templates' },
                    { path: '/communication/campaigns', icon: Send, label: 'Campaigns' },
                  ],
                } satisfies NavItem,
              ]
            : []),
          ...(user?.role === 'ADMIN' ? [{ path: '/users', icon: Users, label: 'Users' }] : []),
        ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const isGroupActive = (item: NavItem) =>
    !!item.children?.some((child) => isActive(child.path));

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navItems.forEach((item) => {
      if (item.children && isGroupActive(item)) {
        initial[item.label] = true;
      }
    });
    return initial;
  });

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 shadow-sm flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold text-primary-600">
          Agape Conference
        </h1>
        <p className="text-xs text-gray-500 mt-1">Management System</p>
      </div>

      <nav className="px-3 pb-4 flex-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.children) {
            const groupActive = isGroupActive(item);
            const isOpen = !!openGroups[item.label];

            return (
              <div key={item.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.label)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    groupActive
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </span>
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isOpen && (
                  <div className="mt-1 ml-4 pl-3 border-l border-gray-200 space-y-1">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const active = isActive(child.path);

                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                            active
                              ? 'bg-primary-50 text-primary-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <ChildIcon size={18} />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = isActive(item.path!);

          return (
            <Link
              key={item.path}
              to={item.path!}
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

      {user && (
        <div className="border-t border-gray-200 p-3">
          <Link
            to="/profile"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold shrink-0">
              {(user.name || user.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.name || user.email}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-red-600 transition-colors text-sm"
          >
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      )}
    </aside>
  );
}
