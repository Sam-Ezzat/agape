/**
 * SwapAttendeesModal Component
 * 
 * WHY: Reusable modal for swapping attendees between rooms
 * Used in both auto-assignment preview and manual assignment pages
 * 
 * FEATURES:
 * - Select attendees from two different rooms (Group A and Group B)
 * - Validate swap before execution
 * - Display errors and warnings
 * - Execute swap and update assignments
 */

import { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, ArrowLeftRight, Search } from 'lucide-react';
import { assignmentApi, attendeeApi, searchApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { Attendee } from '@/types/api';

interface SwapAttendeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwapComplete: () => void;
  attendees: Attendee[];
  customSwapHandler?: (groupA: string[], groupB: string[], targetRoomId?: string) => Promise<{ success: boolean; data?: any }>;
  useLocalSearch?: boolean; // When true, filter local data by API results (for preview mode)
}

interface SwapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  affectedRooms?: Array<{
    roomId: string;
    roomNumber: string;
    beforeCapacity: number;
    afterCapacity: number;
  }>;
}

export default function SwapAttendeesModal({
  isOpen,
  onClose,
  onSwapComplete,
  attendees,
  customSwapHandler,
  useLocalSearch = false,
}: SwapAttendeesModalProps) {
  const [selectedGroupA, setSelectedGroupA] = useState<Set<string>>(new Set());
  const [selectedGroupB, setSelectedGroupB] = useState<Set<string>>(new Set());
  const [targetRoomId, setTargetRoomId] = useState<string | null>(null);
  const [validation, setValidation] = useState<SwapValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Attendee[] | null>(null);
  const [searchCandidates, setSearchCandidates] = useState<string[]>([]);
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all');

  // Use dual-language search API when query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchCandidates([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (useLocalSearch) {
          // Preview mode: Generate search candidates and filter locally
          const response = await searchApi.generateCandidates(searchQuery);
          if (response.success && response.data) {
            setSearchCandidates(response.data.candidates);
            // Filter will be applied by filterAttendees function
            setSearchResults(null);
          }
        } else {
          // Database mode: use full API search
          const response = await attendeeApi.searchAssigned(searchQuery);
          if (response.success && response.data) {
            setSearchResults(response.data);
          }
        }
      } catch (error) {
        console.error('Search failed:', error);
        // Fallback to local filtering
        setSearchResults(null);
        setSearchCandidates([searchQuery]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(searchTimeout);
  }, [searchQuery, useLocalSearch]);

  if (!isOpen) return null;

  const handleAttendeeSelect = (attendeeId: string, group: 'A' | 'B') => {
    // Clear validation when selection changes
    setValidation(null);

    if (group === 'A') {
      // Remove from group B if present
      if (selectedGroupB.has(attendeeId)) {
        const newSet = new Set(selectedGroupB);
        newSet.delete(attendeeId);
        setSelectedGroupB(newSet);
      }

      // Toggle in group A
      const newSet = new Set(selectedGroupA);
      if (newSet.has(attendeeId)) {
        newSet.delete(attendeeId);
      } else {
        newSet.add(attendeeId);
      }
      setSelectedGroupA(newSet);
    } else {
      // Remove from group A if present
      if (selectedGroupA.has(attendeeId)) {
        const newSet = new Set(selectedGroupA);
        newSet.delete(attendeeId);
        setSelectedGroupA(newSet);
      }

      // Toggle in group B
      const newSet = new Set(selectedGroupB);
      if (newSet.has(attendeeId)) {
        newSet.delete(attendeeId);
      } else {
        newSet.add(attendeeId);
      }
      setSelectedGroupB(newSet);
    }
  };

  const handleValidate = async () => {
    if (selectedGroupA.size === 0) {
      toastError('Please select attendees in Group A to move/swap');
      return;
    }

    if (selectedGroupB.size === 0 && !targetRoomId) {
      toastError('Please select attendees in Group B or choose a target room');
      return;
    }

    setIsValidating(true);
    try {
      // Use custom handler for preview mode, otherwise use API
      if (customSwapHandler) {
        // Preview mode - simple validation
        setValidation({
          valid: true,
          errors: [],
          warnings: ['Preview mode: This swap will update the preview only. Click "Confirm & Execute" to save to database.'],
          affectedRooms: [],
        });
        toastSuccess('Swap is valid! Click "Execute Swap" to update preview.');
      } else {
        // Database mode - full validation via API
        const result = await assignmentApi.validateSwap(
          Array.from(selectedGroupA),
          Array.from(selectedGroupB)
        );
        setValidation(result.data);

        if (result.data.valid) {
          toastSuccess('Swap is valid! Click "Execute Swap" to proceed.');
        } else {
          toastError('Swap validation failed. See errors below.');
        }
      }
    } catch (error) {
      console.error('Swap validation failed:', error);
      toastError('Failed to validate swap');
    } finally {
      setIsValidating(false);
    }
  };

  const handleExecuteSwap = async () => {
    if (!validation?.valid) {
      toastError('Please validate the swap first');
      return;
    }

    setIsSwapping(true);
    try {
      // Use custom handler for preview mode, otherwise use API
      if (customSwapHandler) {
        // Preview mode - execute local swap
        const result = await customSwapHandler(
          Array.from(selectedGroupA),
          Array.from(selectedGroupB),
          targetRoomId || undefined
        );
        
        if (result.success) {
          toastSuccess('Preview updated successfully!');
          setSelectedGroupA(new Set());
          setSelectedGroupB(new Set());
          setTargetRoomId(null);
          setValidation(null);
          onSwapComplete();
          onClose();
        } else {
          toastError('Failed to swap in preview');
        }
      } else {
        // Database mode - execute via API
        await assignmentApi.executeSwap(
          Array.from(selectedGroupA),
          Array.from(selectedGroupB)
        );
        toastSuccess('Swap completed successfully!');
        setSelectedGroupA(new Set());
        setSelectedGroupB(new Set());
        setTargetRoomId(null);
        setValidation(null);
        onSwapComplete();
        onClose();
      }
    } catch (error) {
      console.error('Swap execution failed:', error);
      toastError('Failed to execute swap');
    } finally {
      setIsSwapping(false);
    }
  };

  const handleClose = () => {
    setSelectedGroupA(new Set());
    setSelectedGroupB(new Set());
    setTargetRoomId(null);
    setValidation(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchCandidates([]);
    setSelectedRoomFilter('all');
    onClose();
  };

  const handleSelectTargetRoom = (roomId: string) => {
    // If selecting a target room, clear Group B selections
    setSelectedGroupB(new Set());
    setTargetRoomId(targetRoomId === roomId ? null : roomId);
    setValidation(null);
  };

  // Filter attendees based on search query with dual-language support
  const filterAttendees = (attendeeList: Attendee[]) => {
    if (!searchQuery.trim()) {
      return attendeeList;
    }

    const query = searchQuery.toLowerCase().trim();
    
    return attendeeList.filter((attendee) => {
      // If we have search candidates (dual-language), use them
      if (searchCandidates.length > 0) {
        const nameMatch = searchCandidates.some(candidate => 
          attendee.fullName?.toLowerCase().includes(candidate.toLowerCase())
        );
        if (nameMatch) return true;
      } else {
        // Fallback to simple search in full name
        if (attendee.fullName?.toLowerCase().includes(query)) {
          return true;
        }
      }
      
      // Also search in room number, gender, age
      if (attendee.assignment?.room?.roomNumber?.toLowerCase().includes(query)) {
        return true;
      }
      
      if (attendee.gender?.toLowerCase().includes(query)) {
        return true;
      }
      
      if (attendee.age?.toString().includes(query)) {
        return true;
      }
      
      return false;
    });
  };

  // Group attendees by room
  // Use search results from API if available, otherwise filter locally
  const displayAttendees = searchResults || filterAttendees(attendees);
  const filteredAttendees = displayAttendees;
  const allAttendeesByRoom = displayAttendees.reduce((acc, attendee) => {
    const roomId = attendee.assignment?.roomId || 'unassigned';
    if (!acc[roomId]) {
      acc[roomId] = [];
    }
    acc[roomId].push(attendee);
    return acc;
  }, {} as Record<string, Attendee[]>);

  // Apply room filter
  const attendeesByRoom = selectedRoomFilter === 'all' 
    ? allAttendeesByRoom
    : Object.fromEntries(
        Object.entries(allAttendeesByRoom).filter(([roomId]) => roomId === selectedRoomFilter)
      );

  // Get list of all unique rooms for the filter dropdown
  const availableRooms = Object.entries(allAttendeesByRoom)
    .map(([roomId, roomAttendees]) => ({
      id: roomId,
      number: roomAttendees[0]?.assignment?.room?.roomNumber || 'Unassigned',
      count: roomAttendees.length,
      capacity: roomAttendees[0]?.assignment?.room?.capacity || 0,
    }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="text-blue-600" size={24} />
            <h2 className="text-xl font-semibold text-gray-900">Swap Attendees</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Instructions */}
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-sm text-gray-700">
            <strong>Swap:</strong> Select Group A (yellow) and Group B (green), then swap their rooms.<br/>
            <strong>Move:</strong> Select Group A and click "Select as Target" on any room with available space to move attendees.
          </p>
        </div>

        {/* Search Bar & Room Filter */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-3 gap-3 mb-3">
            {/* Search Input */}
            <div className="col-span-2 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search by name (supports Arabic ↔ English)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {isSearching && (
                <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                </div>
              )}
              {searchQuery && !isSearching && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            
            {/* Room Filter */}
            <div>
              <select
                value={selectedRoomFilter}
                onChange={(e) => setSelectedRoomFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="all">All Rooms ({availableRooms.length})</option>
                {availableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.number} ({room.count}/{room.capacity})
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {searchQuery && (
            <p className="text-sm text-gray-600">
              {isSearching ? 'Searching...' : `Found ${filteredAttendees.length} of ${attendees.length} attendees`}
              <span className="text-blue-600 ml-1">(dual-language search)</span>
            </p>
          )}
          
          {selectedRoomFilter !== 'all' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-blue-600 font-medium">
                Filtered: {availableRooms.find(r => r.id === selectedRoomFilter)?.number}
              </span>
              <button
                onClick={() => setSelectedRoomFilter('all')}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Selection Summary */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">
                Group A ({selectedGroupA.size} selected)
              </h3>
              {selectedGroupA.size > 0 ? (
                <ul className="text-sm text-gray-700 space-y-1">
                  {Array.from(selectedGroupA).map((id) => {
                    const attendee = attendees.find((a) => a.id === id);
                    return <li key={id}>{attendee?.fullName || id}</li>;
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No attendees selected</p>
              )}
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">
                Group B ({selectedGroupB.size} selected) {targetRoomId && '(Target Room Selected)'}
              </h3>
              {selectedGroupB.size > 0 ? (
                <ul className="text-sm text-gray-700 space-y-1">
                  {Array.from(selectedGroupB).map((id) => {
                    const attendee = attendees.find((a) => a.id === id);
                    return <li key={id}>{attendee?.fullName || id}</li>;
                  })}
                </ul>
              ) : targetRoomId ? (
                <p className="text-sm text-gray-700">
                  Moving to: {Object.entries(attendeesByRoom).find(([id]) => id === targetRoomId)?.[1]?.[0]?.assignment?.room?.roomNumber || 'Room'}
                </p>
              ) : (
                <p className="text-sm text-gray-500">No attendees or target room selected</p>
              )}
            </div>
          </div>

          {/* Validation Results */}
          {validation && (
            <div className="mb-6 space-y-3">
              {validation.valid ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="font-semibold text-green-900 mb-1">Swap is Valid</h4>
                    <p className="text-sm text-green-800">
                      The swap meets all requirements. Click "Execute Swap" to proceed.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-900 mb-2">Validation Failed</h4>
                    <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                      {validation.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {validation.warnings && validation.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <h4 className="font-semibold text-yellow-900 mb-2">Warnings</h4>
                    <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
                      {validation.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {validation.affectedRooms && validation.affectedRooms.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Affected Rooms</h4>
                  <div className="space-y-2">
                    {validation.affectedRooms.map((room) => (
                      <div
                        key={room.roomId}
                        className="text-sm text-gray-700 flex items-center justify-between"
                      >
                        <span className="font-medium">Room {room.roomNumber}:</span>
                        <span>
                          {room.beforeCapacity} → {room.afterCapacity} occupants
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Attendee List by Room */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Select Attendees by Room
                {selectedRoomFilter !== 'all' && (
                  <span className="ml-2 text-sm font-normal text-blue-600">
                    (Filtered)
                  </span>
                )}
              </h3>
              <span className="text-sm text-gray-500">
                Showing {Object.keys(attendeesByRoom).length} of {availableRooms.length} rooms
              </span>
            </div>
            
            {Object.entries(attendeesByRoom).length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <Search className="mx-auto text-gray-400 mb-3" size={48} />
                <p className="text-gray-600 font-medium mb-1">No attendees found</p>
                <p className="text-sm text-gray-500">
                  {searchQuery 
                    ? `No results for "${searchQuery}". Try a different search term.`
                    : 'No attendees available for swapping.'}
                </p>
              </div>
            ) : (
              Object.entries(attendeesByRoom).map(([roomId, roomAttendees]) => {
              const roomNumber =
                roomAttendees[0]?.assignment?.room?.roomNumber || 'Unassigned';
              const roomCapacity = roomAttendees[0]?.assignment?.room?.capacity || 0;
              const currentOccupancy = roomAttendees.length;
              const availableSpace = roomCapacity - currentOccupancy;

              const isTargetRoom = targetRoomId === roomId;
              const hasGroupASelections = Array.from(selectedGroupA).some(id => 
                roomAttendees.some(a => a.id === id)
              );

              return (
                <div key={roomId} className={`border-2 rounded-lg overflow-hidden ${
                  isTargetRoom ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}>
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900">
                        Room {roomNumber}
                      </h4>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-600">
                          {currentOccupancy}/{roomCapacity} occupied
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          availableSpace > 0 
                            ? 'bg-green-100 text-green-800' 
                            : availableSpace === 0
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {availableSpace > 0 
                            ? `${availableSpace} available` 
                            : availableSpace === 0
                            ? 'Full'
                            : `Over by ${Math.abs(availableSpace)}`}
                        </span>
                        {!hasGroupASelections && availableSpace > 0 && (
                          <button
                            onClick={() => handleSelectTargetRoom(roomId)}
                            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                              isTargetRoom
                                ? 'bg-blue-500 text-white'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            }`}
                          >
                            {isTargetRoom ? '✓ Target Room' : 'Select as Target'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {roomAttendees.map((attendee) => {
                      const inGroupA = selectedGroupA.has(attendee.id);
                      const inGroupB = selectedGroupB.has(attendee.id);

                      return (
                        <div
                          key={attendee.id}
                          className={`px-4 py-3 flex items-center gap-3 ${
                            inGroupA
                              ? 'bg-yellow-50'
                              : inGroupB
                              ? 'bg-green-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAttendeeSelect(attendee.id, 'A')}
                              className={`px-3 py-1 text-xs font-medium rounded ${
                                inGroupA
                                  ? 'bg-yellow-500 text-white'
                                  : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              }`}
                            >
                              Group A
                            </button>
                            <button
                              onClick={() => handleAttendeeSelect(attendee.id, 'B')}
                              className={`px-3 py-1 text-xs font-medium rounded ${
                                inGroupB
                                  ? 'bg-green-500 text-white'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              Group B
                            </button>
                          </div>
                          <span className="text-sm text-gray-900">{attendee.fullName}</span>
                          <span className="text-xs text-gray-500">
                            ({attendee.gender}, Age {attendee.age})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleValidate}
              disabled={selectedGroupA.size === 0 || (selectedGroupB.size === 0 && !targetRoomId) || isValidating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isValidating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Validating...
                </>
              ) : (
                targetRoomId ? 'Validate Move' : 'Validate Swap'
              )}
            </button>
            <button
              onClick={handleExecuteSwap}
              disabled={!validation?.valid || isSwapping}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSwapping ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  {targetRoomId ? 'Moving...' : 'Swapping...'}
                </>
              ) : (
                <>
                  <ArrowLeftRight size={16} />
                  {targetRoomId ? 'Execute Move' : 'Execute Swap'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
