/**
 * Login Page
 *
 * WHY: Public entry point — the only route reachable without a session.
 * Split layout: branding/capabilities on the left, sign-in form on the right.
 */

import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BedDouble, Users, Building2, MessageCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import PasswordInput from '@/components/PasswordInput';

const capabilities = [
  {
    icon: Users,
    title: 'Attendee management',
    description: 'Register, search, check in and track every attendee across your conference.',
  },
  {
    icon: BedDouble,
    title: 'Smart room assignment',
    description: 'Assign rooms manually or let auto-assignment match attendees by rules and preferences.',
  },
  {
    icon: Building2,
    title: 'Full infrastructure model',
    description: 'Model houses, buildings, floors and rooms exactly as they exist on the ground.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp communication',
    description: 'Reach attendees with templated messages and bulk campaigns.',
  },
];

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    const from = (location.state as { from?: string })?.from || '/dashboard';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left: branding & capabilities — collapses to a compact banner on mobile so the form stays above the fold */}
      <div className="relative md:w-1/2 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white px-8 py-8 md:px-16 md:py-0 flex flex-col justify-center overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative max-w-md mx-auto md:mx-0">
          <div className="flex items-center gap-2 mb-4 md:mb-6">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl md:text-4xl font-bold leading-tight">Agape Conference</h1>
              <span className="hidden md:inline text-sm font-medium text-primary-100 tracking-wide uppercase">
                Conference Management System
              </span>
            </div>
          </div>

          <p className="hidden md:block text-primary-100 mt-3 text-base leading-relaxed">
            The operational backbone for running large-scale conferences — from registration and
            room assignment to on-the-ground check-in and attendee communication, all in one
            organization-scoped workspace.
          </p>

          <div className="hidden md:block mt-10 space-y-5">
            {capabilities.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-sm text-primary-100/90">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: sign-in form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 mt-1">Sign in to your organization</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
                Password
              </label>
              <PasswordInput
                id="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary-600 text-white rounded-lg py-2 font-medium hover:bg-primary-700 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
