/**
 * Attendees Page
 * 
 * WHY: Complete CRUD interface for managing conference attendees
 * List, create, edit, delete attendees with search and filtering
 */

import { useEffect, useState } from 'react';
import { attendeeApi, excelApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { Attendee, AttendeeFilters, ConferenceRole, Gender } from '@/types/api';

export default function AttendeesPage() {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [showModal, setShowModal] = useState(false);
  const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<ConferenceRole | ''>('');
  const [genderFilter, setGenderFilter] = useState<Gender | ''>('');

  useEffect(() => {
    loadAttendees();
  }, [pagination.page, search, roleFilter, genderFilter]);

  const loadAttendees = async () => {
    try {
      setLoading(true);
      const filters: AttendeeFilters = {
        page: String(pagination.page),
        limit: String(pagination.limit),
      };
      
      if (search) filters.search = search;
      if (roleFilter) filters.role = roleFilter;
      if (genderFilter) filters.gender = genderFilter;

      const response = await attendeeApi.list(filters);
      setAttendees(response.data);
      setPagination(response.pagination);
    } catch (error) {
      toastError('Failed to load attendees');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    
    try {
      await attendeeApi.delete(id);
      toastSuccess(`${name} deleted successfully`);
      loadAttendees();
    } catch (error) {
      // Error already shown by API service
    }
  };

  const openCreateModal = () => {
    setEditingAttendee(null);
    setShowModal(true);
  };

  const openEditModal = (attendee: Attendee) => {
    setEditingAttendee(attendee);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAttendee(null);
  };

  const handleSave = () => {
    closeModal();
    loadAttendees();
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await excelApi.downloadTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'attendees_template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess('Template downloaded successfully');
    } catch (error) {
      // Error already shown by API service
    }
  };

  const handleExportAttendees = async () => {
    try {
      const blob = await excelApi.exportAttendees();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendees_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess('Attendees exported successfully');
    } catch (error) {
      // Error already shown by API service
    }
  };

  const openImportModal = () => {
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
  };

  const handleImportSuccess = () => {
    closeImportModal();
    loadAttendees();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attendees</h1>
          <p className="text-gray-600 mt-1">Manage conference attendees</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownloadTemplate} className="btn-secondary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Template
          </button>
          <button onClick={openImportModal} className="btn-secondary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </button>
          <button onClick={handleExportAttendees} className="btn-secondary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Attendee
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as ConferenceRole | '');
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="input w-full"
            >
              <option value="">All Roles</option>
              <option value="LEADER">Leader</option>
              <option value="PASTOR">Pastor</option>
              <option value="VIP">VIP</option>
              <option value="ATTENDEE">Attendee</option>
              <option value="STAFF">Staff</option>
              <option value="VOLUNTEER">Volunteer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <select
              value={genderFilter}
              onChange={(e) => {
                setGenderFilter(e.target.value as Gender | '');
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="input w-full"
            >
              <option value="">All</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Attendees Table */}
      <div className="card">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-2 text-gray-600">Loading attendees...</p>
          </div>
        ) : attendees.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="mt-2 text-gray-600">No attendees found</p>
            <button onClick={openCreateModal} className="btn-primary mt-4">
              Add First Attendee
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {attendees.map((attendee) => (
                    <tr key={attendee.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{attendee.fullName}</div>
                          {attendee.churchOrg && (
                            <div className="text-sm text-gray-500">{attendee.churchOrg}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{attendee.phone || '-'}</div>
                        <div className="text-sm text-gray-500">{attendee.email || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {attendee.conferenceRole}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {attendee.checkedInAt ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Checked In
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                            Not Checked In
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => openEditModal(attendee)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(attendee.id, attendee.fullName)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="btn-secondary"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page === pagination.pages}
                  className="btn-secondary ml-3"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of{' '}
                    <span className="font-medium">{pagination.total}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                      disabled={pagination.page === 1}
                      className="btn-secondary rounded-l-md"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                      disabled={pagination.page === pagination.pages}
                      className="btn-secondary rounded-r-md"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <AttendeeModal
          attendee={editingAttendee}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal onClose={closeImportModal} onSuccess={handleImportSuccess} />
      )}
    </div>
  );
}

/**
 * Attendee Create/Edit Modal Component
 */
interface AttendeeModalProps {
  attendee: Attendee | null;
  onClose: () => void;
  onSave: () => void;
}

function AttendeeModal({ attendee, onClose, onSave }: AttendeeModalProps) {
  const [formData, setFormData] = useState({
    fullName: attendee?.fullName || '',
    phone: attendee?.phone || '',
    email: attendee?.email || '',
    age: attendee?.age?.toString() || '',
    gender: attendee?.gender || '' as Gender | '',
    churchOrg: attendee?.churchOrg || '',
    conferenceRole: attendee?.conferenceRole || 'ATTENDEE' as ConferenceRole,
    notes: attendee?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName.trim()) {
      toastError('Full name is required');
      return;
    }

    try {
      setSaving(true);
      const data = {
        fullName: formData.fullName.trim(),
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        age: formData.age ? parseInt(formData.age) : undefined,
        gender: formData.gender || undefined,
        churchOrg: formData.churchOrg.trim() || undefined,
        conferenceRole: formData.conferenceRole,
        notes: formData.notes.trim() || undefined,
      };

      if (attendee) {
        await attendeeApi.update(attendee.id, data);
        toastSuccess(`${formData.fullName} updated successfully`);
      } else {
        await attendeeApi.create(data);
        toastSuccess(`${formData.fullName} created successfully`);
      }

      onSave();
    } catch (error) {
      // Error already shown by API service
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" onClick={onClose}>
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {attendee ? 'Edit Attendee' : 'Add New Attendee'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <input
                type="number"
                min="1"
                max="150"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender | '' })}
                className="input w-full"
              >
                <option value="">Select Gender</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={formData.conferenceRole}
                onChange={(e) => setFormData({ ...formData, conferenceRole: e.target.value as ConferenceRole })}
                className="input w-full"
              >
                <option value="ATTENDEE">Attendee</option>
                <option value="LEADER">Leader</option>
                <option value="PASTOR">Pastor</option>
                <option value="VIP">VIP</option>
                <option value="STAFF">Staff</option>
                <option value="VOLUNTEER">Volunteer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Church/Organization</label>
            <input
              type="text"
              value={formData.churchOrg}
              onChange={(e) => setFormData({ ...formData, churchOrg: e.target.value })}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input w-full"
              placeholder="Special needs, medical info, preferences..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : attendee ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Import Modal - Excel file upload for bulk attendee import
 */
interface ImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function ImportModal({ onClose, onSuccess }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      toastError('Please select a file');
      return;
    }

    try {
      setUploading(true);
      await excelApi.importAttendees(file);
      toastSuccess(`Import completed. Check console for details.`);
      onSuccess();
    } catch (error) {
      // Error already shown by API service
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" onClick={onClose}>
      <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Import Attendees</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Excel File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-primary-50 file:text-primary-700
                hover:file:bg-primary-100"
            />
            {file && (
              <p className="text-xs text-gray-600 mt-1">Selected: {file.name}</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Download the template first to ensure your Excel file has the correct format.
              The import will skip duplicate attendees based on phone number.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={uploading || !file} className="btn-primary">
              {uploading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
