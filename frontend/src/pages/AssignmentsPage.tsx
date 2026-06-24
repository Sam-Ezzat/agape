/**
 * Assignments Page
 * 
 * WHY: Interface for managing room assignments
 * List assignments, create new assignments, bulk assign attendees
 */

import { useEffect, useState } from 'react';
import { assignmentApi, attendeeApi, excelApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { RoomAssignment, Attendee, AssignmentFilters } from '@/types/api';

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<RoomAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [showModal, setShowModal] = useState(false);
  const [unassignedCount, setUnassignedCount] = useState(0);

  // Filters
  const [buildingFilter, setBuildingFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');

  useEffect(() => {
    loadAssignments();
    loadUnassignedCount();
  }, [pagination.page, buildingFilter, floorFilter]);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      const filters: AssignmentFilters = {
        page: String(pagination.page),
        limit: String(pagination.limit),
      };
      
      if (buildingFilter) filters.buildingId = buildingFilter;
      if (floorFilter) filters.floorId = floorFilter;

      const response = await assignmentApi.list(filters);
      setAssignments(response.data);
      setPagination(response.pagination);
    } catch (error) {
      toastError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const loadUnassignedCount = async () => {
    try {
      const response = await attendeeApi.getUnassigned();
      setUnassignedCount(response.data.length);
    } catch (error) {
      console.error('Failed to load unassigned count', error);
    }
  };

  const handleDelete = async (id: string, attendeeName: string) => {
    if (!confirm(`Remove room assignment for ${attendeeName}?`)) return;
    
    try {
      await assignmentApi.delete(id);
      toastSuccess('Assignment removed successfully');
      loadAssignments();
      loadUnassignedCount();
    } catch (error) {
      // Error already shown by API service
    }
  };

  const openAssignModal = () => {
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const handleAssignmentCreated = () => {
    closeModal();
    loadAssignments();
    loadUnassignedCount();
  };

  const handleExportAssignments = async () => {
    try {
      const blob = await excelApi.exportAssignments();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assignments_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess('Assignments exported successfully');
    } catch (error) {
      // Error already shown by API service
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Room Assignments</h1>
          <p className="text-gray-600 mt-1">Manage attendee room assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportAssignments} className="btn-secondary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button onClick={openAssignModal} className="btn-primary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Assign Room
          </button>
        </div>
      </div>

      {/* Stats Banner */}
      {unassignedCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-yellow-800">
              {unassignedCount} attendee{unassignedCount !== 1 ? 's' : ''} without room assignment
            </span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Building</label>
            <input
              type="text"
              placeholder="Filter by building..."
              value={buildingFilter}
              onChange={(e) => {
                setBuildingFilter(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
            <input
              type="text"
              placeholder="Filter by floor..."
              value={floorFilter}
              onChange={(e) => {
                setFloorFilter(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="input w-full"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setBuildingFilter('');
                setFloorFilter('');
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="btn-secondary w-full"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="card">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-2 text-gray-600">Loading assignments...</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="mt-2 text-gray-600">No assignments found</p>
            <button onClick={openAssignModal} className="btn-primary mt-4">
              Create First Assignment
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attendee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Room</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Floor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Building</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {assignments.map((assignment) => (
                    <tr key={assignment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {assignment.attendee?.fullName || '-'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {assignment.attendee?.conferenceRole || '-'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{assignment.room?.roomNumber || '-'}</div>
                        <div className="text-sm text-gray-500">
                          {assignment.room?.roomType} ({assignment.room?.capacity} capacity)
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">Floor {assignment.room?.floor?.floorNumber}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {assignment.room?.floor?.building?.name || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(assignment.assignedAt).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(assignment.assignedAt).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleDelete(assignment.id, assignment.attendee?.fullName || 'attendee')}
                          className="text-red-600 hover:text-red-900"
                        >
                          Remove
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

      {/* Assignment Modal */}
      {showModal && (
        <AssignmentModal onClose={closeModal} onSave={handleAssignmentCreated} />
      )}
    </div>
  );
}

/**
 * Assignment Modal - Simple room assignment interface
 */
interface AssignmentModalProps {
  onClose: () => void;
  onSave: () => void;
}

function AssignmentModal({ onClose, onSave }: AssignmentModalProps) {
  const [unassignedAttendees, setUnassignedAttendees] = useState<Attendee[]>([]);
  const [selectedAttendeeId, setSelectedAttendeeId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUnassignedAttendees();
  }, []);

  const loadUnassignedAttendees = async () => {
    try {
      setLoading(true);
      const response = await attendeeApi.getUnassigned();
      setUnassignedAttendees(response.data);
    } catch (error) {
      toastError('Failed to load unassigned attendees');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAttendeeId) {
      toastError('Please select an attendee');
      return;
    }
    
    if (!roomId.trim()) {
      toastError('Please enter a room ID');
      return;
    }

    try {
      setSaving(true);
      await assignmentApi.create({
        attendeeId: selectedAttendeeId,
        roomId: roomId.trim(),
      });
      
      const attendee = unassignedAttendees.find((a) => a.id === selectedAttendeeId);
      toastSuccess(`${attendee?.fullName} assigned successfully`);
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
          <h3 className="text-lg font-medium text-gray-900">Assign Room</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-2 text-gray-600">Loading attendees...</p>
          </div>
        ) : unassignedAttendees.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-2 text-gray-600">All attendees have been assigned!</p>
            <button onClick={onClose} className="btn-primary mt-4">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Attendee <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={selectedAttendeeId}
                onChange={(e) => setSelectedAttendeeId(e.target.value)}
                className="input w-full"
              >
                <option value="">Choose an attendee...</option>
                {unassignedAttendees.map((attendee) => (
                  <option key={attendee.id} value={attendee.id}>
                    {attendee.fullName} - {attendee.conferenceRole} {attendee.phone ? `(${attendee.phone})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {unassignedAttendees.length} unassigned attendee{unassignedAttendees.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Room ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room ID from database"
                className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the exact room UUID as it appears in the database
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Make sure the room ID exists and has available capacity before assigning.
                You can find room IDs from the Rooms management page.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Assigning...' : 'Assign Room'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
