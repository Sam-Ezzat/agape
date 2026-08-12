/**
 * Users Management Page (admin-only)
 *
 * WHY: Lets an organization admin add teammates, change their role, and
 * remove them. Gated by role, not by route — a non-admin just sees a
 * message here rather than needing a separate route-guard component.
 */

import { FormEvent, useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { toastSuccess, toastError } from '@/services/toast.service';
import { useAuth } from '@/contexts/AuthContext';
import { userApi, OrgUser, UserRole } from '@/services/api.service';

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  MEMBER: 'Member',
  CONFERENCE_HOUSE_MANAGER: 'Conference House Manager',
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setUsers(await userApi.list());
    } catch {
      toastError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (id: string, role: UserRole) => {
    try {
      await userApi.updateRole(id, role);
      toastSuccess('Role updated');
      loadUsers();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemove = async (user: OrgUser) => {
    if (!confirm(`Remove ${user.name} from the organization?`)) return;
    try {
      await userApi.remove(user.id);
      toastSuccess(`${user.name} removed`);
      loadUsers();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to remove user');
    }
  };

  if (!isAdmin) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 mt-1">Manage who has access to your organization</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          Add User
        </button>
      </div>

      {createdCredentials && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900 flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">User created — share this password now, it won't be shown again:</p>
            <p className="mt-1 flex items-center gap-1">
              <span className="font-medium">{createdCredentials.email}</span> /{' '}
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-green-300">
                {passwordVisible ? createdCredentials.password : '•'.repeat(createdCredentials.password.length)}
              </span>
              <button
                type="button"
                onClick={() => setPasswordVisible((v) => !v)}
                className="text-green-700 hover:text-green-900 p-1"
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
              >
                {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </p>
          </div>
          <button
            onClick={() => {
              setCreatedCredentials(null);
              setPasswordVisible(false);
            }}
            className="text-green-700 hover:text-green-900 text-xs font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Joined</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                        className="input py-1 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemove(u)}
                        disabled={isSelf}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={isSelf ? "You can't remove your own account" : 'Remove user'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <AddUserModal
          onClose={() => setShowModal(false)}
          onCreated={(email, password) => {
            setShowModal(false);
            setCreatedCredentials({ email, password });
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

function AddUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (email: string, password: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('MEMBER');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { temporaryPassword } = await userApi.create({ name, email, role });
      onCreated(email, temporaryPassword);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">Add User</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="label">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="label">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="input w-full">
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="CONFERENCE_HOUSE_MANAGER">Conference House Manager</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
