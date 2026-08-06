/**
 * Attendees Page
 * 
 * WHY: Complete CRUD interface for managing conference attendees
 * List, create, edit, delete attendees with search and filtering
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { attendeeApi, assignmentApi, excelApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import { useSocket } from '@/hooks/useSocket';
import { normalizePhoneToE164 } from '@/utils/phone';
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
  const [deletingAttendee, setDeletingAttendee] = useState<{ id: string; name: string } | null>(null);
  const [assignedWarningAttendee, setAssignedWarningAttendee] = useState<Attendee | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const socket = useSocket();
  const navigate = useNavigate();

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  const handleDelete = (attendee: Attendee) => {
    // WHY: Deletion is blocked server-side while a room assignment exists —
    // surface that up front instead of letting the delete fail after the
    // reason has already been picked.
    if (attendee.assignment) {
      setAssignedWarningAttendee(attendee);
      return;
    }
    setDeletingAttendee({ id: attendee.id, name: attendee.fullName });
  };

  const handleConfirmDelete = async (reason: string) => {
    if (!deletingAttendee) return;
    try {
      await attendeeApi.delete(deletingAttendee.id, reason);
      toastSuccess(`${deletingAttendee.name} deleted successfully`);
      setDeletingAttendee(null);
      loadAttendees();
    } catch (error) {
      // Error already shown by API service
    }
  };

  const handleUnassignAndContinueDelete = async () => {
    if (!assignedWarningAttendee?.assignment) return;
    try {
      setUnassigning(true);
      await assignmentApi.delete(assignedWarningAttendee.assignment.id);
      toastSuccess(`${assignedWarningAttendee.fullName} unassigned from their room`);
      setDeletingAttendee({ id: assignedWarningAttendee.id, name: assignedWarningAttendee.fullName });
      setAssignedWarningAttendee(null);
    } catch (error) {
      // Error already shown by API service
    } finally {
      setUnassigning(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (attendees.every((a) => prev.has(a.id))) {
        return new Set();
      }
      return new Set(attendees.map((a) => a.id));
    });
  };

  const handleConfirmBulkDelete = async (reason: string) => {
    const ids = Array.from(selectedIds);
    try {
      setBulkDeleting(true);
      const response = await attendeeApi.bulkDelete(ids, reason);
      const { deleted, failed } = response.data;
      if (deleted.length > 0) {
        toastSuccess(`${deleted.length} attendee(s) deleted successfully`);
      }
      if (failed.length > 0) {
        toastError(`${failed.length} attendee(s) could not be deleted`);
      }
      setShowBulkDeleteModal(false);
      setSelectedIds(new Set());
      loadAttendees();
    } catch (error) {
      // Error already shown by API service
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleSendWhatsAppToSelected = () => {
    navigate('/communication/campaigns', { state: { attendeeIds: Array.from(selectedIds) } });
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

  const handleDeleteFromDetails = () => {
    if (selectedAttendee) {
      handleDelete(selectedAttendee);
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
          <Link to="/attendees/cancellations" className="btn-secondary flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 font-semibold">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.364A9 9 0 015.636 5.636m12.728 12.364L5.636 5.636" />
            </svg>
            Cancellations
          </Link>
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

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div className="card bg-primary-50 border-primary-200 flex items-center justify-between">
          <p className="text-sm font-medium text-primary-900">
            {selectedIds.size} attendee{selectedIds.size > 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSendWhatsAppToSelected}
              className="btn-secondary flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 hover:bg-green-100"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.79 14.14c-.24.68-1.4 1.3-1.94 1.35-.5.05-1.09.24-3.66-.79-3.14-1.26-5.15-4.49-5.3-4.7-.16-.21-1.26-1.68-1.26-3.2 0-1.52.8-2.27 1.08-2.58.28-.31.6-.38.8-.38.2 0 .4 0 .58.01.19.01.44-.07.68.53.25.6.85 2.08.92 2.23.07.15.12.33.02.53-.1.2-.15.33-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.76 1.26 1.64 2.04 1.13 1 2.08 1.32 2.38 1.47.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.24.68-.14.28.1 1.77.83 2.07 1 .3.15.5.23.57.35.08.13.08.72-.16 1.4z" />
              </svg>
              Send WhatsApp Message
            </button>
            <button
              onClick={() => setShowBulkDeleteModal(true)}
              className="btn-secondary flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 hover:bg-red-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-gray-500 hover:text-gray-700 px-2"
            >
              Clear
            </button>
          </div>
        </div>
      )}

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
                    <th className="px-6 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={attendees.length > 0 && attendees.every((a) => selectedIds.has(a.id))}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {attendees.map((attendee) => (
                    <tr key={attendee.id} className={`hover:bg-gray-50 ${selectedIds.has(attendee.id) ? 'bg-primary-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(attendee.id)}
                          onChange={() => toggleSelect(attendee.id)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      </td>
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
                          onClick={() => handleDelete(attendee)}
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

      {/* Room Assignment Warning — shown before the deletion reason modal */}
      {assignedWarningAttendee && (
        <AssignedAttendeeWarningModal
          attendee={assignedWarningAttendee}
          unassigning={unassigning}
          onCancel={() => setAssignedWarningAttendee(null)}
          onUnassignAndContinue={handleUnassignAndContinueDelete}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingAttendee && (
        <DeleteConfirmationModal
          title="Delete Attendee"
          description={
            <>
              Are you sure you want to delete <strong className="text-gray-900">{deletingAttendee.name}</strong>? Please select a cancellation reason for auditing:
            </>
          }
          onClose={() => setDeletingAttendee(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <DeleteConfirmationModal
          title="Delete Selected Attendees"
          description={
            <>
              Are you sure you want to delete <strong className="text-gray-900">{selectedIds.size}</strong> selected attendee{selectedIds.size > 1 ? 's' : ''}? Please select a cancellation reason for auditing (applied to all):
            </>
          }
          confirmLabel={bulkDeleting ? 'Deleting...' : 'Confirm Delete'}
          disabled={bulkDeleting}
          onClose={() => setShowBulkDeleteModal(false)}
          onConfirm={handleConfirmBulkDelete}
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

    // Phone must include a valid country code (e.g. +201271384211) — normalize
    // local formats (0127...) and reject anything that still doesn't look valid.
    let normalizedPhone: string | undefined;
    if (formData.phone.trim()) {
      const result = normalizePhoneToE164(formData.phone.trim());
      if (!result) {
        toastError('Phone number must include a valid country code, e.g. +201271384211');
        return;
      }
      normalizedPhone = result;
    }

    try {
      setSaving(true);
      const data = {
        ticketId: formData.ticketId.trim() || undefined,
        fullName: formData.fullName.trim(),
        phone: normalizedPhone,
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
                  placeholder="+201271384211"
                />
                <p className="text-xs text-gray-500 mt-1">Include country code (e.g. +20 for Egypt)</p>
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
  const [softDeletedMatched, setSoftDeletedMatched] = useState<any[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGeneralError(null);
    setImportErrors(null);
    setImportSummary(null);
    setSoftDeletedMatched([]);
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

  const handleReactivateMatched = async (id: string, name: string) => {
    try {
      await attendeeApi.reactivate(id);
      toastSuccess(`${name} reactivated successfully`);
      setSoftDeletedMatched((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      // Handled
    }
  };

  const getReasonFromNotes = (notes: string | null | undefined): string => {
    if (!notes) return 'No reason provided';
    const match = notes.match(/\[Cancellation Reason:\s*([^\]]+)\]/);
    return match && match[1] ? match[1] : 'No reason provided';
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
      setSoftDeletedMatched([]);
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
        const { imported, failed, errors, softDeletedMatched: matched } = response.data || {};
        setImportSummary({ imported: imported || 0, failed: failed || 0 });
        if (failed > 0) {
          setImportErrors(errors || []);
        }
        if (matched && matched.length > 0) {
          setSoftDeletedMatched(matched);
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

            {softDeletedMatched.length > 0 && (
              <div className="flex flex-col mb-4 overflow-hidden max-h-[40vh] border rounded-lg p-3 bg-red-50 border-red-200">
                <div className="text-sm font-semibold text-red-950 mb-2">
                  ⚠️ Previously Cancelled/Deleted Attendees Detected on Spreadsheet:
                </div>
                <div className="overflow-auto flex-1">
                  <table className="min-w-full divide-y divide-red-200 text-xs">
                    <thead className="bg-red-100 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-red-900">Name</th>
                        <th className="px-3 py-2 text-left font-semibold text-red-900">Ticket ID</th>
                        <th className="px-3 py-2 text-left font-semibold text-red-900">Cancellation Reason</th>
                        <th className="px-3 py-2 text-center font-semibold text-red-900">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-red-200">
                      {softDeletedMatched.map((match) => (
                        <tr key={match.id} className="hover:bg-red-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{match.fullName}</td>
                          <td className="px-3 py-2 text-gray-600 font-mono">{match.ticketId || '-'}</td>
                          <td className="px-3 py-2 text-red-700 italic">{getReasonFromNotes(match.internalNotes)}</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleReactivateMatched(match.id, match.fullName)}
                              className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-semibold text-[11px] uppercase transition-colors"
                            >
                              Reactivate
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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

/**
 * Assigned Attendee Warning Modal
 *
 * WHY: Deletion is blocked server-side while a room assignment exists.
 * Surface that up front — before the reason-for-deletion picker — so the
 * admin can unassign and continue in one flow instead of hitting a 409
 * after already filling out the reason form.
 */
interface AssignedAttendeeWarningModalProps {
  attendee: Attendee;
  unassigning: boolean;
  onCancel: () => void;
  onUnassignAndContinue: () => void;
}

function AssignedAttendeeWarningModal({
  attendee,
  unassigning,
  onCancel,
  onUnassignAndContinue,
}: AssignedAttendeeWarningModalProps) {
  const room = attendee.assignment?.room as any;
  const roomLabel = room
    ? `Room ${room.roomNumber}${room.floor?.building?.name ? ` in ${room.floor.building.name}` : ''}`
    : 'a room';

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-amber-600" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Attendee is assigned to a room</h3>
            <p className="text-sm text-gray-600 mt-1">
              <strong className="text-gray-900">{attendee.fullName}</strong> is currently assigned to{' '}
              <strong className="text-gray-900">{roomLabel}</strong>. They must be unassigned before they
              can be deleted.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t mt-2">
          <button type="button" onClick={onCancel} disabled={unassigning} className="btn-secondary text-sm px-4 py-2">
            Keep assigned
          </button>
          <button
            type="button"
            onClick={onUnassignAndContinue}
            disabled={unassigning}
            className="px-5 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors shadow disabled:opacity-50"
          >
            {unassigning ? 'Unassigning...' : 'Unassign & continue to delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Delete Confirmation Modal
 */
interface DeleteConfirmationModalProps {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

function DeleteConfirmationModal({ title, description, confirmLabel = 'Confirm Delete', disabled, onClose, onConfirm }: DeleteConfirmationModalProps) {
  const [selectedReason, setSelectedReason] = useState('Emergency Cancellation');
  const [otherText, setOtherText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = selectedReason === 'Other' ? otherText.trim() : selectedReason;
    if (selectedReason === 'Other' && !otherText.trim()) {
      toastError('Please describe the reason');
      return;
    }
    onConfirm(finalReason || 'Unspecified Cancellation');
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 pb-2 border-b">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500 font-bold text-xl">
            ×
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600">{description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {[
              'Emergency Cancellation',
              'Not interesting',
              'plan to another something',
              'Other',
            ].map((reason) => (
              <label key={reason} className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 hover:bg-gray-100 rounded border transition-colors">
                <input
                  type="radio"
                  name="cancellationReason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {reason === 'plan to another something' ? 'Plan to another something' : reason === 'Not interesting' ? 'Not interesting' : reason}
                </span>
              </label>
            ))}
          </div>

          {selectedReason === 'Other' && (
            <div className="animate-fade-in pt-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Describe Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Describe why deletion is required..."
                className="input w-full text-sm border rounded p-2 focus:ring-red-500"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t mt-4">
            <button type="button" onClick={onClose} disabled={disabled} className="btn-secondary text-sm px-4 py-2">
              Cancel
            </button>
            <button type="submit" disabled={disabled} className="px-5 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors shadow disabled:opacity-50">
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
