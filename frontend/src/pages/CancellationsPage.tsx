/**
 * Cancellations Page
 * 
 * WHY: Dedicated page to view, search, inspect, and reactivate cancelled/soft-deleted attendees
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { attendeeApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { Attendee } from '@/types/api';

export default function CancellationsPage() {
  const [cancelledAttendees, setCancelledAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [isDualSearchEnabled, setIsDualSearchEnabled] = useState(true);

  useEffect(() => {
    loadCancellations();
  }, [currentPage, search, isDualSearchEnabled]);

  const loadCancellations = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: String(currentPage),
        limit: String(limit),
        onlyDeleted: 'true',
      };

      if (search) {
        params.search = search;
        params.dualSearch = isDualSearchEnabled ? 'true' : 'false';
      }

      const response = await attendeeApi.list(params);
      setCancelledAttendees(response.data);
      setTotalPages(response.pagination.pages);
      setTotalCount(response.pagination.total);
    } catch (error) {
      toastError('Failed to load cancelled attendees');
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async (id: string, name: string) => {
    try {
      await attendeeApi.reactivate(id);
      toastSuccess(`${name} reactivated successfully`);
      if (selectedAttendee && selectedAttendee.id === id) {
        setShowDetailsModal(false);
        setSelectedAttendee(null);
      }
      // If of current page and last item, go to previous page
      if (cancelledAttendees.length === 1 && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        loadCancellations();
      }
    } catch (error) {
      // Error already handled
    }
  };

  const getReasonFromNotes = (notes: string | null | undefined): string => {
    if (!notes) return 'No reason provided';
    const match = notes.match(/\[Cancellation Reason:\s*([^\]]+)\]/);
    return match && match[1] ? match[1] : 'No reason provided';
  };

  const openDetailsModal = (attendee: Attendee) => {
    setSelectedAttendee(attendee);
    setShowDetailsModal(true);
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedAttendee(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/attendees" className="btn-secondary p-2 inline-flex items-center justify-center rounded-md">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cancelled Attendees</h1>
            <p className="text-gray-600 mt-1">Manage and reactivate cancelled registrations</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="card">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search Cancelled Attendees</label>
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
      </div>

      {/* Main Table */}
      <div className="card">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-2 text-gray-600">Loading cancellations...</p>
          </div>
        ) : cancelledAttendees.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            <p className="mt-2 text-gray-600">No cancelled attendees found</p>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason of Cancellation</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {cancelledAttendees.map((attendee) => (
                    <tr key={attendee.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div 
                          onClick={() => openDetailsModal(attendee)}
                          className="cursor-pointer text-sm font-semibold text-gray-950 hover:text-primary-600 transition-colors"
                        >
                          {attendee.fullName}
                          {attendee.church && (
                            <div className="text-xs text-gray-500 font-normal">{attendee.church}</div>
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
                      <td className="px-6 py-4 whitespace-normal">
                        <div className="text-sm text-red-700 font-medium bg-red-50 px-2.5 py-1 rounded inline-block">
                          {getReasonFromNotes(attendee.internalNotes)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleReactivate(attendee.id, attendee.fullName)}
                          className="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-800 rounded font-semibold text-xs transition-colors"
                        >
                          Reactivate
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

      {/* Cancellation Details Modal */}
      {showDetailsModal && selectedAttendee && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 animate-fade-in" onClick={closeDetailsModal}>
          <div className="relative top-10 mx-auto p-6 border w-full max-w-3xl shadow-lg rounded-md bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{selectedAttendee.fullName}</h3>
                <p className="text-sm text-gray-500 mt-1">Cancellation Personal Details</p>
              </div>
              <button onClick={closeDetailsModal} className="text-gray-400 hover:text-gray-500">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-lg">
                <h5 className="font-semibold text-sm mb-1 text-red-800">Cancellation Reason</h5>
                <p className="text-sm">{getReasonFromNotes(selectedAttendee.internalNotes)}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4">
                <div className="py-2 border-b">
                  <span className="font-medium text-gray-500 block">Ticket ID</span>
                  <span className="text-gray-900">{selectedAttendee.ticketId || '-'}</span>
                </div>
                <div className="py-2 border-b">
                  <span className="font-medium text-gray-500 block">Phone</span>
                  <span className="text-gray-900">{selectedAttendee.phone || '-'}</span>
                </div>
                <div className="py-2 border-b">
                  <span className="font-medium text-gray-500 block">Email</span>
                  <span className="text-gray-900">{selectedAttendee.email || '-'}</span>
                </div>
                <div className="py-2 border-b">
                  <span className="font-medium text-gray-500 block">Gender</span>
                  <span className="text-gray-900">{selectedAttendee.gender || '-'}</span>
                </div>
                <div className="py-2 border-b">
                  <span className="font-medium text-gray-500 block">Church</span>
                  <span className="text-gray-900">{selectedAttendee.church || '-'}</span>
                </div>
                <div className="py-2 border-b">
                  <span className="font-medium text-gray-500 block">Governorate</span>
                  <span className="text-gray-900">{selectedAttendee.governorate || '-'}</span>
                </div>
                <div className="py-2 border-b">
                  <span className="font-medium text-gray-500 block">Age</span>
                  <span className="text-gray-900">{selectedAttendee.age || '-'}</span>
                </div>
                <div className="py-2 border-b">
                  <span className="font-medium text-gray-500 block">Role</span>
                  <span className="text-gray-900">{selectedAttendee.conferenceRole || '-'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-6 border-t mt-6">
              <button 
                type="button" 
                onClick={closeDetailsModal} 
                className="btn-secondary"
              >
                Close
              </button>
              <button 
                type="button" 
                onClick={() => handleReactivate(selectedAttendee.id, selectedAttendee.fullName)} 
                className="px-4 py-2 bg-green-600 font-semibold text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Reactivate Attendee
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}