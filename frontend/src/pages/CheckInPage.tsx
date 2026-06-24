/**
 * Check-in Page
 * 
 * WHY: Quick interface for checking attendees in/out of conference
 * Search by name/phone, view current status, one-click check-in/out
 * 
 * API Endpoints Used:
 * - GET /api/attendees (search)
 * - POST /api/attendees/:id/check-in
 * - POST /api/attendees/:id/check-out
 * - GET /api/attendees/:id/details (view assignment)
 */

import { useState } from 'react';
import { attendeeApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { Attendee } from '@/types/api';

export default function CheckInPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Attendee[]>([]);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) {
      toastError('Please enter a search term');
      return;
    }

    try {
      setLoading(true);
      const response = await attendeeApi.list({ 
        search: searchQuery.trim(),
        limit: '10',
      });
      setSearchResults(response.data);
      
      if (response.data.length === 0) {
        toastError('No attendees found');
      }
    } catch (error) {
      // Error already shown by API service
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAttendee = async (attendee: Attendee) => {
    try {
      // Fetch full details including assignment
      const response = await attendeeApi.getDetails(attendee.id);
      setSelectedAttendee(response.data);
    } catch (error) {
      toastError('Failed to load attendee details');
    }
  };

  const handleCheckIn = async () => {
    if (!selectedAttendee) return;
    
    try {
      setProcessing(true);
      await attendeeApi.checkIn(selectedAttendee.id);
      toastSuccess(`${selectedAttendee.fullName} checked in successfully`);
      
      // Refresh attendee details
      const response = await attendeeApi.getDetails(selectedAttendee.id);
      setSelectedAttendee(response.data);
      
      // Update in search results
      setSearchResults((prev) =>
        prev.map((a) => (a.id === response.data.id ? response.data : a))
      );
    } catch (error) {
      // Error already shown by API service
    } finally {
      setProcessing(false);
    }
  };

  const handleCheckOut = async () => {
    if (!selectedAttendee) return;
    
    if (!confirm(`Are you sure you want to check out ${selectedAttendee.fullName}?`)) {
      return;
    }
    
    try {
      setProcessing(true);
      await attendeeApi.checkOut(selectedAttendee.id);
      toastSuccess(`${selectedAttendee.fullName} checked out successfully`);
      
      // Refresh attendee details
      const response = await attendeeApi.getDetails(selectedAttendee.id);
      setSelectedAttendee(response.data);
      
      // Update in search results
      setSearchResults((prev) =>
        prev.map((a) => (a.id === response.data.id ? response.data : a))
      );
    } catch (error) {
      // Error already shown by API service
    } finally {
      setProcessing(false);
    }
  };

  const clearSelection = () => {
    setSelectedAttendee(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Check-in / Check-out</h1>
        <p className="text-gray-600 mt-1">Search attendees and manage check-in status</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search Panel */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Search Attendee</h2>
          
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search by Name or Phone
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter name or phone number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input flex-1"
                />
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </div>
            </div>
          </form>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-medium text-gray-700">Results ({searchResults.length})</h3>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {searchResults.map((attendee) => (
                  <div
                    key={attendee.id}
                    onClick={() => handleSelectAttendee(attendee)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedAttendee?.id === attendee.id
                        ? 'bg-primary-50 border-primary-300'
                        : 'bg-white hover:bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{attendee.fullName}</div>
                        <div className="text-sm text-gray-500">{attendee.phone || 'No phone'}</div>
                        {attendee.churchOrg && (
                          <div className="text-sm text-gray-500">{attendee.churchOrg}</div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {attendee.conferenceRole}
                        </span>
                        {attendee.checkedInAt ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Checked In
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                            Not Checked In
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Attendee Details Panel */}
        <div className="card">
          {selectedAttendee ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Attendee Details</h2>
                <button onClick={clearSelection} className="text-gray-400 hover:text-gray-500">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Personal Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Personal Information</h3>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-600">Name:</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedAttendee.fullName}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-600">Phone:</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedAttendee.phone || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-600">Email:</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedAttendee.email || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-600">Age:</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedAttendee.age || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-600">Gender:</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedAttendee.gender || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-600">Church/Org:</dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedAttendee.churchOrg || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-600">Role:</dt>
                      <dd>
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {selectedAttendee.conferenceRole}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Check-in Status */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Check-in Status</h3>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-600">Status:</dt>
                      <dd>
                        {selectedAttendee.checkedInAt ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Checked In
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                            Not Checked In
                          </span>
                        )}
                      </dd>
                    </div>
                    {selectedAttendee.checkedInAt && (
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600">Checked In At:</dt>
                        <dd className="text-sm font-medium text-gray-900">
                          {new Date(selectedAttendee.checkedInAt).toLocaleString()}
                        </dd>
                      </div>
                    )}
                    {selectedAttendee.checkedOutAt && (
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600">Checked Out At:</dt>
                        <dd className="text-sm font-medium text-gray-900">
                          {new Date(selectedAttendee.checkedOutAt).toLocaleString()}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Room Assignment */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Room Assignment</h3>
                  {(selectedAttendee as any).assignment ? (
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600">Room:</dt>
                        <dd className="text-sm font-medium text-gray-900">
                          {(selectedAttendee as any).assignment.room.roomNumber}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600">Floor:</dt>
                        <dd className="text-sm font-medium text-gray-900">
                          Floor {(selectedAttendee as any).assignment.room.floor.floorNumber}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600">Building:</dt>
                        <dd className="text-sm font-medium text-gray-900">
                          {(selectedAttendee as any).assignment.room.floor.building.buildingName}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-600">Assigned:</dt>
                        <dd className="text-sm font-medium text-gray-900">
                          {new Date((selectedAttendee as any).assignment.assignedAt).toLocaleString()}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-sm text-gray-500">No room assigned yet</p>
                  )}
                </div>

                {/* Notes */}
                {selectedAttendee.notes && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h3 className="font-medium text-yellow-900 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Notes
                    </h3>
                    <p className="text-sm text-yellow-800">{selectedAttendee.notes}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-4 border-t space-y-2">
                  {!selectedAttendee.checkedInAt ? (
                    <button
                      onClick={handleCheckIn}
                      disabled={processing}
                      className="btn-primary w-full"
                    >
                      {processing ? 'Processing...' : '✓ Check In'}
                    </button>
                  ) : (
                    <button
                      onClick={handleCheckOut}
                      disabled={processing}
                      className="btn-secondary w-full"
                    >
                      {processing ? 'Processing...' : '✗ Check Out'}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="mt-2 text-gray-600">Search and select an attendee to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
