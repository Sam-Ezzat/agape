/**
 * Attendees Page
 * 
 * WHY: Complete CRUD interface for managing conference attendees
 * List, create, edit, delete attendees with search and filtering
 */

import { useEffect, useState } from 'react';
import { attendeeApi, excelApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import { useSocket } from '@/hooks/useSocket';
import type { Attendee, AttendeeFilters, ConferenceRole, Gender } from '@/types/api';

export default function AttendeesPage() {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const socket = useSocket();
  
  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<ConferenceRole | ''>('');
  const [genderFilter, setGenderFilter] = useState<Gender | ''>('');
  const [isDualSearchEnabled, setIsDualSearchEnabled] = useState(true); // Dual-language search ON by default

  useEffect(() => {
    loadAttendees();
  }, [currentPage, search, roleFilter, genderFilter, isDualSearchEnabled]);

  // Listen for real-time updates via socket
  useEffect(() => {
    if (!socket) return;

    const handleAttendeeUpdate = async (payload: any) => {
      const attendeeId = payload?.data?.attendeeId || payload?.attendeeId;
      
      // If details modal is open for this attendee, refresh it
      if (selectedAttendee && attendeeId === selectedAttendee.id) {
        try {
          const response = await attendeeApi.getById(selectedAttendee.id);
          setSelectedAttendee(response.data);
        } catch (error) {
          console.error('Failed to refresh selected attendee:', error);
        }
      }
      
      // Update attendee in the current list if present
      if (attendeeId && attendees.length > 0) {
        const attendeeInList = attendees.find(a => a.id === attendeeId);
        if (attendeeInList) {
          try {
            const response = await attendeeApi.getById(attendeeId);
            setAttendees((prev) =>
              prev.map((a) => (a.id === attendeeId ? response.data : a))
            );
          } catch (error) {
            console.error('Failed to refresh attendee in list:', error);
          }
        }
      }
    };

    const handleAttendeeCreatedOrDeleted = () => {
      // Reload the entire list when attendees are added or removed
      loadAttendees();
    };

    // Listen for various attendee events
    socket.on('attendee:created', handleAttendeeCreatedOrDeleted);
    socket.on('attendee:updated', handleAttendeeUpdate);
    socket.on('attendee:deleted', handleAttendeeCreatedOrDeleted);
    socket.on('attendee:checked-in', handleAttendeeUpdate);
    socket.on('attendee:checked-out', handleAttendeeUpdate);

    return () => {
      socket.off('attendee:created', handleAttendeeCreatedOrDeleted);
      socket.off('attendee:updated', handleAttendeeUpdate);
      socket.off('attendee:deleted', handleAttendeeCreatedOrDeleted);
      socket.off('attendee:checked-in', handleAttendeeUpdate);
      socket.off('attendee:checked-out', handleAttendeeUpdate);
    };
  }, [socket, selectedAttendee, attendees]);

  const loadAttendees = async () => {
    try {
      setLoading(true);
      const filters: AttendeeFilters = {
        page: String(currentPage),
        limit: String(limit),
      };
      
      if (search) {
        filters.search = search;
        filters.dualSearch = isDualSearchEnabled ? 'true' : 'false';
      }
      if (roleFilter) filters.role = roleFilter;
      if (genderFilter) filters.gender = genderFilter;

      const response = await attendeeApi.list(filters);
      setAttendees(response.data);
      setTotalPages(response.pagination.pages);
      setTotalCount(response.pagination.total);
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

  const openDetailsModal = (attendee: Attendee) => {
    setSelectedAttendee(attendee);
    setShowDetailsModal(true);
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedAttendee(null);
  };

  const openCreateModal = () => {
    setEditingAttendee(null);
    setShowModal(true);
  };

  const openEditModal = (attendee: Attendee) => {
    setEditingAttendee(attendee);
    setShowModal(true);
  };

  const openEditFromDetails = () => {
    if (selectedAttendee) {
      openEditModal(selectedAttendee);
      closeDetailsModal();
    }
  };

  const handleDeleteFromDetails = async () => {
    if (selectedAttendee) {
      await handleDelete(selectedAttendee.id, selectedAttendee.fullName);
      closeDetailsModal();
    }
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
              placeholder="Search by name (Arabic or English)..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="input w-full"
            />
            {/* Dual-language search toggle */}
            <div className="mt-2 flex items-center">
              <input
                type="checkbox"
                id="dualSearch"
                checked={isDualSearchEnabled}
                onChange={(e) => setIsDualSearchEnabled(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="dualSearch" className="ml-2 text-sm text-gray-600">
                Enable Arabic/English search (finds "مينا" when searching "Mina")
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as ConferenceRole | '');
                setCurrentPage(1);
              }}
              className="input w-full"
            >
              <option value="">All Roles</option>
              <option value="LEADER">Leader</option>
              <option value="PASTOR">Pastor</option>
              <option value="VIP">VIP</option>
              <option value="ATTENDEE">Attendee</option>
              <option value="EXCEPTION">Exception</option>
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
                setCurrentPage(1);
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
                        <div 
                          onClick={() => openDetailsModal(attendee)}
                          className="cursor-pointer hover:text-primary-600"
                        >
                          <div className="text-sm font-medium text-gray-900">{attendee.fullName}</div>
                          {attendee.church && (
                            <div className="text-sm text-gray-500">{attendee.church}</div>
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
                        {attendee.checkedOutAt ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">
                            Checked Out
                          </span>
                        ) : attendee.checkedInAt ? (
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
                  onClick={() => setCurrentPage((p) => p - 1)}
                  disabled={currentPage === 1}
                  className="btn-secondary"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={currentPage === totalPages}
                  className="btn-secondary ml-3"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{(currentPage - 1) * limit + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * limit, totalCount)}</span> of{' '}
                    <span className="font-medium">{totalCount}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => setCurrentPage((p) => p - 1)}
                      disabled={currentPage === 1}
                      className="btn-secondary rounded-l-md"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={currentPage === totalPages}
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

      {/* Attendee Details Modal */}
      {showDetailsModal && selectedAttendee && (
        <AttendeeDetailsModal 
          attendee={selectedAttendee}
          onClose={closeDetailsModal}
          onEdit={openEditFromDetails}
          onDelete={handleDeleteFromDetails}
        />
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
    ticketId: attendee?.ticketId || '',
    fullName: attendee?.fullName || '',
    phone: attendee?.phone || '',
    email: attendee?.email || '',
    age: attendee?.age?.toString() || '',
    gender: attendee?.gender || '' as Gender | '',
    church: attendee?.church || '',
    area: attendee?.area || '',
    governorate: attendee?.governorate || '',
    isServant: attendee?.isServant !== undefined ? String(attendee.isServant) : '',
    arrivalMethod: attendee?.arrivalMethod || '',
    busPickupPoint: attendee?.busPickupPoint || '',
    paymentMethod: attendee?.paymentMethod || '',
    paymentStatus: attendee?.paymentStatus || 'PENDING',
    transactionNumber: attendee?.transactionNumber || '',
    conferenceRole: attendee?.conferenceRole || 'ATTENDEE' as ConferenceRole,
    notes: attendee?.notes || '',
    roomingNotes: attendee?.roomingNotes || '',
    internalNotes: attendee?.internalNotes || '',
  });
  const [saving, setSaving] = useState(false);

  // Get age range based on role
  const getAgeRange = (role: ConferenceRole) => {
    switch (role) {
      case 'ATTENDEE':
        return { min: 18, max: 35 };
      case 'EXCEPTION':
        return { min: 13, max: 45 };
      default:
        return { min: 18, max: 65 };
    }
  };

  const ageRange = getAgeRange(formData.conferenceRole);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName.trim()) {
      toastError('Full name is required');
      return;
    }

    // Validate age based on role
    if (formData.age) {
      const age = parseInt(formData.age);
      const { min, max } = getAgeRange(formData.conferenceRole);
      
      if (age < min || age > max) {
        toastError(`Age must be between ${min} and ${max} for ${formData.conferenceRole} role`);
        return;
      }
    }

    try {
      setSaving(true);
      const data = {
        ticketId: formData.ticketId.trim() || undefined,
        fullName: formData.fullName.trim(),
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        age: formData.age ? parseInt(formData.age) : undefined,
        gender: formData.gender || undefined,
        church: formData.church.trim() || undefined,
        area: formData.area.trim() || undefined,
        governorate: formData.governorate.trim() || undefined,
        isServant: formData.isServant === 'true' ? true : formData.isServant === 'false' ? false : undefined,
        arrivalMethod: formData.arrivalMethod.trim() || undefined,
        busPickupPoint: formData.busPickupPoint.trim() || undefined,
        paymentMethod: formData.paymentMethod.trim() || undefined,
        paymentStatus: formData.paymentStatus,
        transactionNumber: formData.transactionNumber.trim() || undefined,
        conferenceRole: formData.conferenceRole,
        notes: formData.notes.trim() || undefined,
        roomingNotes: formData.roomingNotes.trim() || undefined,
        internalNotes: formData.internalNotes.trim() || undefined,
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-3">Basic Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticket ID</label>
                <input
                  type="text"
                  value={formData.ticketId}
                  onChange={(e) => setFormData({ ...formData, ticketId: e.target.value })}
                  className="input w-full"
                  placeholder="TO-20260607-123456"
                />
              </div>
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
                  min={ageRange.min}
                  max={ageRange.max}
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className="input w-full"
                  placeholder={`${ageRange.min}-${ageRange.max} for ${formData.conferenceRole}`}
                />
                <p className="text-xs text-gray-500 mt-1">Required: {ageRange.min}-{ageRange.max} years</p>
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
            </div>
          </div>

          {/* Church & Location */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-3">Church & Location</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Church</label>
                <input
                  type="text"
                  value={formData.church}
                  onChange={(e) => setFormData({ ...formData, church: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
                <input
                  type="text"
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  className="input w-full"
                  placeholder="Neighborhood"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Governorate</label>
                <select
                  value={formData.governorate}
                  onChange={(e) => setFormData({ ...formData, governorate: e.target.value })}
                  className="input w-full"
                >
                  <option value="">اختر المحافظة</option>
                  <option value="Cairo">القاهرة</option>
                  <option value="Alexandria">الإسكندرية</option>
                  <option value="10th Ramadan">العاشر من رمضان</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Are you a servant in your church?</label>
                <select
                  value={formData.isServant}
                  onChange={(e) => setFormData({ ...formData, isServant: e.target.value })}
                  className="input w-full"
                >
                  <option value="">No selection</option>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
            </div>
          </div>

          {/* Travel & Transportation */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-3">Travel & Transportation</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Arrival Method</label>
                <select
                  value={formData.arrivalMethod}
                  onChange={(e) => {
                    const method = e.target.value;
                    setFormData({ 
                      ...formData, 
                      arrivalMethod: method,
                      busPickupPoint: method === 'Private car' ? 'private car' : ''
                    });
                  }}
                  className="input w-full"
                >
                  <option value="">No selection</option>
                  <option value="Conference Bus">باص المؤتمر</option>
                  <option value="Private car">ملاكي</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bus Pickup Point</label>
                {formData.arrivalMethod === 'Private car' ? (
                  <input
                    type="text"
                    value="private car"
                    readOnly
                    className="input w-full bg-gray-100 cursor-not-allowed"
                  />
                ) : formData.arrivalMethod === 'Conference Bus' ? (
                  <select
                    value={formData.busPickupPoint}
                    onChange={(e) => setFormData({ ...formData, busPickupPoint: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Select pickup point</option>
                    <option value="el-ketbi hospital">مستشفى القبطي</option>
                    <option value="Meriland Garden">حديقة الميريلاند</option>
                    <option value="ezbet el-nakhl">عزبة النخل</option>
                    <option value="Alexandria">إسكندرية</option>
                    <option value="10th Ramadan">العاشر من رمضان</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData.busPickupPoint}
                    onChange={(e) => setFormData({ ...formData, busPickupPoint: e.target.value })}
                    className="input w-full"
                    placeholder="Specify pickup location"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Payment Information */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-3">Payment Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <input
                  type="text"
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                  className="input w-full"
                  placeholder="InstaPay, Orange Cash, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                <select
                  value={formData.paymentStatus}
                  onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                  className="input w-full"
                >
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Number</label>
                <input
                  type="text"
                  value={formData.transactionNumber}
                  onChange={(e) => setFormData({ ...formData, transactionNumber: e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>
          </div>

          {/* Conference Details */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-3">Conference Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.conferenceRole}
                  onChange={(e) => setFormData({ ...formData, conferenceRole: e.target.value as ConferenceRole })}
                  className="input w-full"
                >
                  <option value="ATTENDEE">Attendee</option>
                  <option value="EXCEPTION">Exception</option>
                  <option value="LEADER">Leader</option>
                  <option value="PASTOR">Pastor</option>
                  <option value="VIP">VIP</option>
                  <option value="STAFF">Staff</option>
                  <option value="VOLUNTEER">Volunteer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-3">Notes</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">General Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input w-full"
                  placeholder="Special needs, medical info, preferences..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rooming Notes</label>
                <textarea
                  rows={2}
                  value={formData.roomingNotes}
                  onChange={(e) => setFormData({ ...formData, roomingNotes: e.target.value })}
                  className="input w-full"
                  placeholder="Room assignment preferences..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes (Admin Only)</label>
                <textarea
                  rows={2}
                  value={formData.internalNotes}
                  onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                  className="input w-full"
                  placeholder="Admin notes..."
                />
              </div>
            </div>
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
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [statusMessage, setProgressMessage] = useState('');
  const [importErrors, setImportErrors] = useState<any[] | null>(null);
  const [importSummary, setImportSummary] = useState<{ imported: number; failed: number } | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGeneralError(null);
    setImportErrors(null);
    setImportSummary(null);
    setProgressPercentage(0);
    
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Max file size limit: 10MB
      if (selectedFile.size > 10 * 1024 * 1024) {
        setGeneralError('File size exceeds the 10MB limit. Please upload a smaller file.');
        setFile(null);
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setGeneralError('Please select a file to import.');
      return;
    }

    try {
      setUploading(true);
      setGeneralError(null);
      setImportErrors(null);
      setImportSummary(null);
      setProgressPercentage(5);
      setProgressMessage('Uploading Spreadsheet File...');

      // Dynamic progress emulation block timer
      let simVal = 5;
      const simTimer = setInterval(() => {
        if (simVal < 90) {
          simVal += Math.floor(Math.random() * 8) + 2;
          setProgressPercentage(Math.min(90, simVal));
        }
      }, 300);

      const response = await excelApi.importAttendees(file, (progressEvent) => {
        const total = progressEvent.total || file.size;
        const uploadProgress = Math.round((progressEvent.loaded * 100) / total);
        // Map upload to 0% - 60%
        const mappedUploadProgress = Math.round((uploadProgress * 60) / 100);
        if (mappedUploadProgress > simVal) {
          simVal = mappedUploadProgress;
          setProgressPercentage(mappedUploadProgress);
        }
        if (uploadProgress >= 100) {
          setProgressMessage('Verifying syntax and processing records in database...');
        }
      });
      
      clearInterval(simTimer);
      setProgressPercentage(100);
      setProgressMessage('Complete!');

      if (response.success) {
        const { imported, failed, errors } = response.data || {};
        setImportSummary({ imported: imported || 0, failed: failed || 0 });
        if (failed > 0) {
          setImportErrors(errors || []);
        } else {
          // Silent success handled - no toast alert shown
        }
      } else {
        setGeneralError(response.message || 'Import failed unexpectedly.');
      }
    } catch (error: any) {
      setGeneralError(error.message || 'Server timeout or exceeded file size limits. Please verify database connectivity.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <h3 className="text-lg font-medium text-gray-900">Import Attendees</h3>
          {!uploading && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {uploading ? (
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-primary-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <div className="text-sm font-semibold text-gray-700">{progressPercentage}%</div>
            <p className="text-xs text-gray-500 animate-pulse">{statusMessage}</p>
          </div>
        ) : importSummary ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="bg-green-50 border border-green-200 text-green-900 rounded-lg p-3 text-sm mb-4">
              <strong>Import Operation Finished Successfully (Silent Mode):</strong> {importSummary.imported} attendees successfully imported / updated.
            </div>

            {importErrors && importErrors.length > 0 && (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm mb-4">
                  <strong>Warning:</strong> {importSummary.failed} record rows failed validation. See table below:
                </div>

                <div className="overflow-auto flex-1 border rounded-lg mb-4">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Row</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Field</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Value</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {importErrors.map((err, idx) => (
                        <tr key={idx} className="hover:bg-red-50 hover:bg-opacity-30">
                          <td className="px-4 py-2 font-medium text-gray-900">{err.row}</td>
                          <td className="px-4 py-2 text-red-600 font-medium">{err.field || 'general'}</td>
                          <td className="px-4 py-2 text-gray-500">{err.value !== null && err.value !== undefined ? String(err.value) : 'N/A'}</td>
                          <td className="px-4 py-2 text-gray-700">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button 
                type="button" 
                onClick={() => {
                  onSuccess();
                  onClose();
                }} 
                className="btn-primary"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {generalError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
                <strong>Upload Error:</strong> {generalError}
              </div>
            )}

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
                <p className="text-xs text-gray-600 mt-1">Selected: {file.name} ({Math.round(file.size / 1024)} KB)</p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Download the template first to ensure your Excel file has the correct format.
                The import operation runs in silent mode and will seamlessly upsert details for any duplicate Ticket IDs.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={!file} className="btn-primary">
                Import Attendees
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Attendee Details Modal - Display full attendee information
 */
interface AttendeeDetailsModalProps {
  attendee: Attendee;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function AttendeeDetailsModal({ attendee, onClose, onEdit, onDelete }: AttendeeDetailsModalProps) {
  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleString();
  };

  const DetailRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
    <div className="py-3 border-b border-gray-200">
      <dt className="text-sm font-medium text-gray-500 mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{value || '-'}</dd>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" onClick={onClose}>
      <div className="relative top-10 mx-auto p-6 border w-full max-w-3xl shadow-lg rounded-md bg-white" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">{attendee.fullName}</h3>
            <p className="text-sm text-gray-500 mt-1">Attendee Details</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto">
          {/* Status Badges */}
          <div className="flex gap-2 mb-6">
            <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
              {attendee.conferenceRole}
            </span>
            {attendee.checkedOutAt ? (
              <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">
                Checked Out
              </span>
            ) : attendee.checkedInAt ? (
              <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                Checked In
              </span>
            ) : (
              <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                Not Checked In
              </span>
            )}
            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
              attendee.paymentStatus === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
              attendee.paymentStatus === 'REJECTED' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              Payment: {attendee.paymentStatus}
            </span>
          </div>

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            {/* Basic Information */}
            <div className="col-span-2">
              <h4 className="text-lg font-semibold text-gray-800 mb-3 mt-4">Basic Information</h4>
            </div>
            <DetailRow label="Ticket ID" value={attendee.ticketId} />
            <DetailRow label="Full Name" value={attendee.fullName} />
            <DetailRow label="Phone" value={attendee.phone} />
            <DetailRow label="Email" value={attendee.email} />
            <DetailRow label="Age" value={attendee.age} />
            <DetailRow label="Gender" value={attendee.gender} />

            {/* Church & Location */}
            <div className="col-span-2">
              <h4 className="text-lg font-semibold text-gray-800 mb-3 mt-4">Church & Location</h4>
            </div>
            <DetailRow label="Church" value={attendee.church} />
            <DetailRow label="Area" value={attendee.area} />
            <DetailRow label="Governorate" value={attendee.governorate} />

            {/* Travel & Transportation */}
            <div className="col-span-2">
              <h4 className="text-lg font-semibold text-gray-800 mb-3 mt-4">Travel & Transportation</h4>
            </div>
            <DetailRow label="Arrival Method" value={attendee.arrivalMethod} />
            <DetailRow label="Bus Pickup Point" value={attendee.busPickupPoint} />

            {/* Payment Information */}
            <div className="col-span-2">
              <h4 className="text-lg font-semibold text-gray-800 mb-3 mt-4">Payment Information</h4>
            </div>
            <DetailRow label="Payment Method" value={attendee.paymentMethod} />
            <DetailRow label="Payment Status" value={attendee.paymentStatus} />
            <DetailRow label="Transaction Number" value={attendee.transactionNumber} />

            {/* Check-in Information */}
            <div className="col-span-2">
              <h4 className="text-lg font-semibold text-gray-800 mb-3 mt-4">Check-in Information</h4>
            </div>
            <DetailRow label="Checked In At" value={formatDate(attendee.checkedInAt)} />
            <DetailRow label="Checked Out At" value={formatDate(attendee.checkedOutAt)} />

            {/* Notes */}
            {(attendee.notes || attendee.roomingNotes || attendee.internalNotes) && (
              <>
                <div className="col-span-2">
                  <h4 className="text-lg font-semibold text-gray-800 mb-3 mt-4">Notes</h4>
                </div>
                {attendee.notes && (
                  <div className="col-span-2">
                    <DetailRow label="General Notes" value={attendee.notes} />
                  </div>
                )}
                {attendee.roomingNotes && (
                  <div className="col-span-2">
                    <DetailRow label="Rooming Notes" value={attendee.roomingNotes} />
                  </div>
                )}
                {attendee.internalNotes && (
                  <div className="col-span-2">
                    <DetailRow label="Internal Notes (Admin Only)" value={attendee.internalNotes} />
                  </div>
                )}
              </>
            )}

            {/* System Information */}
            <div className="col-span-2">
              <h4 className="text-lg font-semibold text-gray-800 mb-3 mt-4">System Information</h4>
            </div>
            <DetailRow label="Created At" value={formatDate(attendee.createdAt)} />
            <DetailRow label="Updated At" value={formatDate(attendee.updatedAt)} />
          </dl>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-6 border-t mt-6">
          <button 
            type="button" 
            onClick={onClose} 
            className="btn-secondary"
          >
            Close
          </button>
          <button 
            type="button" 
            onClick={onDelete} 
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Delete
          </button>
          <button 
            type="button" 
            onClick={onEdit} 
            className="btn-primary"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
