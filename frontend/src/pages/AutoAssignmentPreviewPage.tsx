import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, RotateCcw, ArrowLeft, Download, AlertTriangle, ArrowUpDown, X, User } from 'lucide-react';
import { AutoAssignmentExecutionResult, Attendee } from '@/types/api';
import { autoAssignmentApi, attendeeApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';

type SortOption = 'room' | 'attendee' | 'score' | 'building';

interface RoomCapacityInfo {
  roomId: string;
  roomNumber: string;
  buildingName: string;
  floorNumber: number;
  assignedCount: number;
  capacity: number;
}

/**
 * Auto-Assignment Preview Results Page
 * Shows detailed preview results in a full-page view with sorting and room capacity
 */
export default function AutoAssignmentPreviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [previewResult, setPreviewResult] = useState<AutoAssignmentExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('room');
  
  // Attendee modal state
  const [showAttendeeModal, setShowAttendeeModal] = useState(false);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [isLoadingAttendee, setIsLoadingAttendee] = useState(false);

  // Load preview result from localStorage on mount
  useEffect(() => {
    const savedPreview = localStorage.getItem('autoAssignmentPreview');
    const houseId = searchParams.get('houseId');
    const buildingIds = searchParams.get('buildingIds');

    if (savedPreview) {
      try {
        const parsed = JSON.parse(savedPreview);
        setPreviewResult(parsed);
      } catch (error) {
        console.error('Failed to parse saved preview:', error);
      }
    }

    if (houseId) setSelectedHouseId(houseId);
    if (buildingIds) setSelectedBuildingIds(buildingIds.split(','));
  }, [searchParams]);

  // Calculate room capacity information
  const roomCapacityMap = useMemo<Map<string, RoomCapacityInfo>>(() => {
    const map = new Map<string, RoomCapacityInfo>();
    
    if (!previewResult?.assignments) return map;

    previewResult.assignments.forEach((assignment) => {
      const roomKey = assignment.roomId;
      
      if (!map.has(roomKey)) {
        // Extract capacity from reasoning text (e.g., "occupancy 4/4")
        let capacity = 0;
        const match = assignment.reason?.match(/occupancy (\d+)\/(\d+)/);
        if (match && match[2]) {
          capacity = parseInt(match[2], 10);
        }
        
        map.set(roomKey, {
          roomId: assignment.roomId,
          roomNumber: assignment.roomNumber,
          buildingName: assignment.buildingName,
          floorNumber: assignment.floorNumber,
          assignedCount: 1,
          capacity: capacity,
        });
      } else {
        const info = map.get(roomKey)!;
        info.assignedCount += 1;
      }
    });

    return map;
  }, [previewResult?.assignments]);

  // Sort assignments based on selected sort option
  const sortedAssignments = useMemo(() => {
    if (!previewResult?.assignments) return [];

    const assignments = [...previewResult.assignments];

    switch (sortBy) {
      case 'room':
        return assignments.sort((a, b) => {
          // CRITICAL: Sort by roomId first to ensure all attendees in same room are together
          // This prevents other rooms from intersecting the same room's rows
          if (a.roomId !== b.roomId) {
            // For different rooms, sort by building -> floor -> room number
            if (a.buildingName !== b.buildingName) {
              return a.buildingName.localeCompare(b.buildingName);
            }
            if (a.floorNumber !== b.floorNumber) {
              return a.floorNumber - b.floorNumber;
            }
            return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
          }
          // Same room: sort by attendee name for consistency
          return a.attendeeName.localeCompare(b.attendeeName);
        });
      case 'attendee':
        return assignments.sort((a, b) => a.attendeeName.localeCompare(b.attendeeName));
      case 'score':
        return assignments.sort((a, b) => b.score - a.score); // Descending
      case 'building':
        return assignments.sort((a, b) => {
          if (a.buildingName !== b.buildingName) {
            return a.buildingName.localeCompare(b.buildingName);
          }
          return a.attendeeName.localeCompare(b.attendeeName);
        });
      default:
        return assignments;
    }
  }, [previewResult?.assignments, sortBy]);

  const handleConfirmAndExecute = async () => {
    if (!selectedHouseId || selectedBuildingIds.length === 0) {
      toastError('Missing configuration data');
      return;
    }

    try {
      setIsExecuting(true);
      
      const response = await autoAssignmentApi.execute({
        conferenceHouseId: selectedHouseId,
        buildingIds: selectedBuildingIds,
        dryRun: false,
      });

      if (response.success) {
        toastSuccess(`Successfully assigned ${response.data.assignmentsCreated} attendees`);
        
        // Clear saved preview
        localStorage.removeItem('autoAssignmentPreview');
        
        // Navigate back to main page
        navigate('/auto-assignment');
      }
    } catch (error) {
      console.error('Execution error:', error);
      toastError('Failed to execute assignments');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleAttendeeClick = async (attendeeId: string) => {
    try {
      setIsLoadingAttendee(true);
      setShowAttendeeModal(true);
      
      const response = await attendeeApi.getById(attendeeId);
      
      if (response.success && response.data) {
        setSelectedAttendee(response.data);
      } else {
        toastError('Failed to load attendee details');
        setShowAttendeeModal(false);
      }
    } catch (error) {
      console.error('Error fetching attendee:', error);
      toastError('Failed to load attendee details');
      setShowAttendeeModal(false);
    } finally {
      setIsLoadingAttendee(false);
    }
  };

  const handleCloseModal = () => {
    setShowAttendeeModal(false);
    setSelectedAttendee(null);
  };

  const handleBackToConfig = () => {
    navigate('/auto-assignment');
  };

  const handleClearPreview = () => {
    localStorage.removeItem('autoAssignmentPreview');
    setPreviewResult(null);
    navigate('/auto-assignment');
  };

  const handleExportCSV = () => {
    if (!sortedAssignments || sortedAssignments.length === 0) return;

    const headers = ['#', 'Attendee', 'Room', 'Room Capacity', 'Building', 'Floor', 'Score', 'Group Type', 'Roommates Together', 'Reasoning'];
    const rows = sortedAssignments.map((assignment, idx) => {
      const roomCapacity = roomCapacityMap.get(assignment.roomId);
      const capacityStr = roomCapacity ? `${roomCapacity.assignedCount}/${roomCapacity.capacity}` : '';
      
      return [
        idx + 1,
        assignment.attendeeName || '',
        assignment.roomNumber || '',
        capacityStr,
        assignment.buildingName || '',
        assignment.floorNumber || '',
        `${(assignment.score * 100).toFixed(0)}%`,
        assignment.groupInfo?.groupType || 'individual',
        assignment.groupInfo?.roommatesInSameRoom 
          ? `${assignment.groupInfo.roommatesInSameRoom}/${assignment.groupInfo.groupSize}`
          : '',
        assignment.reason || ''
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto-assignment-preview-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!previewResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Preview Results</h2>
          <p className="text-gray-600 mb-4">Run a preview from the Auto-Assignment page first.</p>
          <button
            onClick={handleBackToConfig}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Auto-Assignment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBackToConfig}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Assignment Preview Results</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {previewResult.assignments?.length || 0} assignments • {previewResult.executionTimeMs}ms execution time
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Download size={16} />
                Export CSV
              </button>
              <button
                onClick={handleClearPreview}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <RotateCcw size={16} />
                Clear & Start Over
              </button>
              <button
                onClick={handleConfirmAndExecute}
                disabled={isExecuting}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
              >
                {isExecuting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Confirm & Execute
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Assignments Created</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {previewResult.assignmentsCreated || 0}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Rooms Used</div>
            <div className="text-2xl font-bold text-indigo-600 mt-1">
              {roomCapacityMap.size}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Attendees Processed</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {previewResult.attendeesProcessed || 0}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Unassigned</div>
            <div className="text-2xl font-bold text-orange-600 mt-1">
              {previewResult.unassignedAttendees?.length || 0}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Execution Time</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {previewResult.executionTimeMs}ms
            </div>
          </div>
        </div>

        {/* Sort Controls */}
        <div className="bg-white rounded-lg shadow px-6 py-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowUpDown size={18} className="text-gray-500" />
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="room">Room Number</option>
              <option value="attendee">Attendee Name</option>
              <option value="score">Match Score</option>
              <option value="building">Building</option>
            </select>
          </div>
          {sortBy === 'room' && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Room View:</span> Assignments grouped by room with capacity indicators
            </div>
          )}
        </div>

        {/* Assignments Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attendee</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Floor</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-1/2">Detailed Reasoning</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedAssignments.map((assignment, idx) => {
                  // Check if we need to show a room header (when sorted by room and it's a new room)
                  const prevAssignment = idx > 0 ? sortedAssignments[idx - 1] : null;
                  const nextAssignment = idx < sortedAssignments.length - 1 ? sortedAssignments[idx + 1] : null;
                  const showRoomHeader = sortBy === 'room' && 
                    (idx === 0 || (prevAssignment && prevAssignment.roomId !== assignment.roomId));
                  const isLastInRoom = sortBy === 'room' && 
                    (!nextAssignment || nextAssignment.roomId !== assignment.roomId);
                  
                  const roomCapacity = roomCapacityMap.get(assignment.roomId);
                  const capacityPercent = roomCapacity 
                    ? (roomCapacity.assignedCount / roomCapacity.capacity) * 100 
                    : 0;

                  return (
                    <>
                      {/* Divider between room groups (not before first room) */}
                      {showRoomHeader && idx > 0 && (
                        <tr key={`divider-${assignment.roomId}`} className="border-t-4 border-gray-300">
                          <td colSpan={7} className="h-0 p-0"></td>
                        </tr>
                      )}
                      
                      {/* Room Header Row (only when sorted by room) */}
                      {showRoomHeader && roomCapacity && (
                        <tr key={`header-${assignment.roomId}`} className="bg-blue-50 border-t-2 border-blue-200">
                          <td colSpan={7} className="px-3 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-blue-900">
                                  Room {roomCapacity.roomNumber}
                                </span>
                                <span className="text-xs text-blue-700">
                                  {roomCapacity.buildingName} • Floor {roomCapacity.floorNumber}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  capacityPercent >= 100 ? 'bg-green-100 text-green-800' :
                                  capacityPercent >= 75 ? 'bg-blue-100 text-blue-800' :
                                  capacityPercent >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-orange-100 text-orange-800'
                                }`}>
                                  {roomCapacity.assignedCount}/{roomCapacity.capacity} assigned
                                </span>
                                {/* Capacity visual bar */}
                                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all ${
                                      capacityPercent >= 100 ? 'bg-green-500' :
                                      capacityPercent >= 75 ? 'bg-blue-500' :
                                      capacityPercent >= 50 ? 'bg-yellow-500' :
                                      'bg-orange-500'
                                    }`}
                                    style={{ width: `${Math.min(capacityPercent, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      
                      {/* Assignment Row */}
                      <tr key={`assignment-${idx}`} className={`hover:bg-gray-50 ${
                        isLastInRoom ? 'border-b-2 border-blue-200' : ''
                      }`}>
                        <td className="px-3 py-4 text-sm text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-4 text-sm font-medium">
                          <button
                            onClick={() => handleAttendeeClick(assignment.attendeeId)}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                          >
                            <User size={14} />
                            {assignment.attendeeName}
                          </button>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            <span>{assignment.roomNumber}</span>
                            {sortBy !== 'room' && roomCapacity && (
                              <span className="text-xs text-gray-500 font-medium">
                                ({roomCapacity.assignedCount}/{roomCapacity.capacity})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-600">{assignment.buildingName}</td>
                        <td className="px-3 py-4 text-sm text-gray-600">{assignment.floorNumber}</td>
                    <td className="px-3 py-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        assignment.score >= 0.8 ? 'bg-green-100 text-green-800' :
                        assignment.score >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {(assignment.score * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-700">
                      <div className="space-y-2">
                        {/* Group Badge */}
                        {assignment.groupInfo && assignment.groupInfo.groupType !== 'individual' && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              assignment.groupInfo.groupType === 'roommate' ? 'bg-blue-100 text-blue-800' :
                              assignment.groupInfo.groupType === 'family' ? 'bg-purple-100 text-purple-800' :
                              assignment.groupInfo.groupType === 'church' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {assignment.groupInfo.groupType.toUpperCase()}
                              {assignment.groupInfo.groupSize > 1 && ` (${assignment.groupInfo.groupSize})`}
                            </span>
                            {assignment.groupInfo.roommatesInSameRoom !== undefined && (
                              <span className="text-xs text-gray-600 font-medium">
                                {assignment.groupInfo.roommatesInSameRoom}/{assignment.groupInfo.groupSize} together
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Reasoning Text */}
                        <div className="text-xs leading-relaxed whitespace-normal text-gray-700">
                          {assignment.reason || 'No reasoning available'}
                        </div>
                        
                        {/* Score Breakdown */}
                        {assignment.scoreBreakdown && Object.keys(assignment.scoreBreakdown).length > 0 && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">
                              View Score Breakdown
                            </summary>
                            <div className="mt-2 space-y-1 pl-3 border-l-2 border-gray-200">
                              {Object.entries(assignment.scoreBreakdown)
                                .sort((a, b) => b[1] - a[1])
                                .map(([rule, score]) => (
                                  <div key={rule} className="flex justify-between items-center">
                                    <span className="text-gray-600">{rule.replace('Rule', '')}:</span>
                                    <span className="font-medium text-gray-900">
                                      {(score * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </details>
                        )}
                        
                        {/* Warnings */}
                        {assignment.warnings && assignment.warnings.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              ⚠️ {assignment.warnings[0]}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Unassigned Attendees */}
        {previewResult.unassignedAttendees && previewResult.unassignedAttendees.length > 0 && (
          <div className="mt-6 bg-amber-50 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-amber-900 mb-4">
              Unassigned Attendees ({previewResult.unassignedAttendees.length})
            </h3>
            <div className="space-y-2">
              {previewResult.unassignedAttendees.map((u, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm">
                  <span className="font-medium text-amber-900">{idx + 1}.</span>
                  <div className="flex-1">
                    <div className="font-medium text-amber-900">{u.name}</div>
                    <div className="text-amber-700">{u.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Attendee Details Modal */}
      {showAttendeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <User size={24} className="text-blue-600" />
                Attendee Details
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="px-6 py-4">
              {isLoadingAttendee ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
                </div>
              ) : selectedAttendee ? (
                <div className="space-y-6">
                  {/* Personal Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Personal Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Full Name</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.fullName}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Ticket ID</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.ticketId || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Age</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.age || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Gender</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.gender || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Phone</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.phone || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Email</label>
                        <p className="text-base text-gray-900 mt-1 break-all">{selectedAttendee.email || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Church & Location */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Church & Location</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Church</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.church || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Governorate</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.governorate || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Area</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.area || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Is Servant</label>
                        <p className="text-base text-gray-900 mt-1">
                          {selectedAttendee.isServant ? (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Yes</span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">No</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Conference Details */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Conference Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Role</label>
                        <p className="text-base text-gray-900 mt-1">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            selectedAttendee.conferenceRole === 'VIP' ? 'bg-purple-100 text-purple-800' :
                            selectedAttendee.conferenceRole === 'LEADER' ? 'bg-blue-100 text-blue-800' :
                            selectedAttendee.conferenceRole === 'PASTOR' ? 'bg-indigo-100 text-indigo-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {selectedAttendee.conferenceRole}
                          </span>
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Arrival Method</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.arrivalMethod || 'N/A'}</p>
                      </div>
                      {selectedAttendee.busPickupPoint && (
                        <div className="col-span-2">
                          <label className="text-sm font-medium text-gray-600">Bus Pickup Point</label>
                          <p className="text-base text-gray-900 mt-1">{selectedAttendee.busPickupPoint}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Payment Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Payment Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Payment Method</label>
                        <p className="text-base text-gray-900 mt-1">{selectedAttendee.paymentMethod || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Payment Status</label>
                        <p className="text-base text-gray-900 mt-1">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            selectedAttendee.paymentStatus === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
                            selectedAttendee.paymentStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                            selectedAttendee.paymentStatus === 'REJECTED' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {selectedAttendee.paymentStatus || 'N/A'}
                          </span>
                        </p>
                      </div>
                      {selectedAttendee.transactionNumber && (
                        <div className="col-span-2">
                          <label className="text-sm font-medium text-gray-600">Transaction Number</label>
                          <p className="text-base text-gray-900 mt-1 font-mono">{selectedAttendee.transactionNumber}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  {(selectedAttendee.roomingNotes || selectedAttendee.notes || selectedAttendee.internalNotes) && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Notes</h3>
                      <div className="space-y-3">
                        {selectedAttendee.roomingNotes && (
                          <div>
                            <label className="text-sm font-medium text-blue-600">Rooming Notes</label>
                            <p className="text-sm text-gray-900 mt-1 bg-blue-50 p-3 rounded">{selectedAttendee.roomingNotes}</p>
                          </div>
                        )}
                        {selectedAttendee.notes && (
                          <div>
                            <label className="text-sm font-medium text-gray-600">General Notes</label>
                            <p className="text-sm text-gray-900 mt-1 bg-gray-50 p-3 rounded">{selectedAttendee.notes}</p>
                          </div>
                        )}
                        {selectedAttendee.internalNotes && (
                          <div>
                            <label className="text-sm font-medium text-orange-600">Internal Notes</label>
                            <p className="text-sm text-gray-900 mt-1 bg-orange-50 p-3 rounded">{selectedAttendee.internalNotes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Check-in Status */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Check-in Status</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Checked In</label>
                        <p className="text-base text-gray-900 mt-1">
                          {selectedAttendee.checkedInAt ? (
                            <>
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Yes</span>
                              <span className="text-xs text-gray-600 ml-2">
                                {new Date(selectedAttendee.checkedInAt).toLocaleString()}
                              </span>
                            </>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">Not checked in</span>
                          )}
                        </p>
                      </div>
                      {selectedAttendee.checkedOutAt && (
                        <div>
                          <label className="text-sm font-medium text-gray-600">Checked Out</label>
                          <p className="text-base text-gray-900 mt-1">
                            <span className="text-xs text-gray-600">
                              {new Date(selectedAttendee.checkedOutAt).toLocaleString()}
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-600">No attendee data available</div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
