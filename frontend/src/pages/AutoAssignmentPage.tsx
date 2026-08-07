/**
 * Auto-Assignment Page
 * 
 * WHY: Interface for AI-powered automatic room assignment
 * Provides configuration, execution, and real-time progress tracking
 * 
 * Features:
 * - Configure assignment rules and weights
 * - Select buildings for assignment
 * - Preview (dry run) before executing
 * - Real-time progress via WebSocket
 * - View results and statistics
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '@/hooks/useSocket';
import { autoAssignmentApi, conferenceHouseApi, buildingApi } from '@/services/api.service';
import { toastSuccess, toastError, toastWarning } from '@/services/toast.service';
import type {
  AutoAssignmentExecutionResult,
  AutoAssignmentStatus,
  Building,
} from '@/types/api';
import { NotificationEvent } from '@/types/notifications';
import { Play, Eye, Settings, RotateCcw, Zap } from 'lucide-react';

// WHY: Default rule weights for new configurations
// Keys must match backend snake_case format
const DEFAULT_RULE_WEIGHTS = {
  same_church: 0.25,
  same_governorate: 0.15,
  similar_age: 0.20,
  minimize_empty_beds: 0.15,
  prefer_same_floor: 0.15,
  leader_proximity: 0.10,
};

// Helper to calculate room statistics recursively for a building
const getBuildingStats = (building: Building) => {
  let totalCapacity = 0;
  let totalRooms = 0;
  let availableRooms = 0;
  let assignedBeds = 0;

  building.floors?.forEach(floor => {
    floor.rooms?.forEach(room => {
      totalRooms++;
      totalCapacity += room.capacity || 0;
      const assignmentsCount = room.assignments?.length || 0;
      assignedBeds += assignmentsCount;
      if (assignmentsCount < (room.capacity || 0)) {
        availableRooms++;
      }
    });
  });

  return {
    totalCapacity,
    totalRooms,
    availableRooms,
    availableBeds: totalCapacity - assignedBeds,
  };
};

export default function AutoAssignmentPage() {
  const navigate = useNavigate();
  
  // State
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<string>('');
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([]);
  // WHY: Manual per-building gender pin. Buildings absent from this map keep
  // the automatic first-come gender behavior.
  const [buildingGenderOverrides, setBuildingGenderOverrides] = useState<Record<string, 'MALE' | 'FEMALE'>>({});
  
  const [status, setStatus] = useState<AutoAssignmentStatus | null>(null);
  const [ruleWeights, setRuleWeights] = useState(DEFAULT_RULE_WEIGHTS);
  const [staffReservedCapacity, setStaffReservedCapacity] = useState(0.15);
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [executionResult, setExecutionResult] = useState<AutoAssignmentExecutionResult | null>(null);
  
  // Progress tracking
  const [currentStage, setCurrentStage] = useState('');
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [configDirty, setConfigDirty] = useState(false);
  
  // Socket connection
  const socket = useSocket();
  
  // Debug: Log executionResult changes
  useEffect(() => {
    console.log('🔄 executionResult changed:', executionResult);
    console.log('📊 Has assignments:', executionResult?.assignments?.length);
    console.log('📋 Display condition met:', 
      executionResult && 
      executionResult.assignments && 
      executionResult.assignments.length > 0
    );
  }, [executionResult]);
  
  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);
  
  // Subscribe to auto-assignment progress events
  useEffect(() => {
    if (!socket) return;
    
    const handleProgress = (payload: any) => {
      console.log('📊 Progress event received:', payload);
      
      // The backend wraps the event in payload.data.event
      const event = payload.data?.event;
      if (!event) {
        console.warn('⚠️ Progress event missing event data');
        return;
      }
      
      // Handle different event types
      if (event.type === 'stage' && event.stage) {
        setCurrentStage(`${event.stage.name} - ${event.stage.status}`);
      }
      
      if (event.type === 'progress' && event.progress) {
        setProgressPercentage(event.progress.percentage || 0);
        setProgressMessage(
          `Processing: ${event.progress.processed}/${event.progress.total} attendees`
        );
      }
      
      if (event.type === 'assignment' && event.assignment) {
        setProgressMessage(
          `Assigned ${event.assignment.attendeeName} to ${event.assignment.roomNumber}`
        );
      }
    };
    
    const handleComplete = (payload: any) => {
      console.log('🎯 handleComplete triggered:', payload);
      console.log('📦 Payload data:', payload.data);
      console.log('📊 Result:', payload.data?.result);
      
      setIsExecuting(false);
      setIsPreviewing(false);
      setProgressPercentage(100);
      
      if (payload.data?.result) {
        console.log('✅ Setting executionResult from WebSocket with', payload.data.result.assignments?.length, 'assignments');
        setExecutionResult(payload.data.result);
      } else {
        console.warn('⚠️ WebSocket complete event missing result data');
      }
      
      // Reload status
      if (selectedHouseId) {
        loadStatus(selectedHouseId);
      }
      
      toastSuccess(payload.message || 'Auto-assignment completed');
    };
    
    const handleError = (payload: any) => {
      console.error('❌ WebSocket error event:', payload);
      setIsExecuting(false);
      setIsPreviewing(false);
      setProgressPercentage(0);
      toastError(payload.message || 'Auto-assignment failed');
    };
    
    socket.on(NotificationEvent.AUTO_ASSIGNMENT_PROGRESS, handleProgress);
    socket.on(NotificationEvent.AUTO_ASSIGNMENT_PREVIEW_PROGRESS, handleProgress);
    socket.on(NotificationEvent.AUTO_ASSIGNMENT_COMPLETE, handleComplete);
    socket.on(NotificationEvent.AUTO_ASSIGNMENT_ERROR, handleError);
    
    return () => {
      socket.off(NotificationEvent.AUTO_ASSIGNMENT_PROGRESS, handleProgress);
      socket.off(NotificationEvent.AUTO_ASSIGNMENT_PREVIEW_PROGRESS, handleProgress);
      socket.off(NotificationEvent.AUTO_ASSIGNMENT_COMPLETE, handleComplete);
      socket.off(NotificationEvent.AUTO_ASSIGNMENT_ERROR, handleError);
    };
  }, [socket, selectedHouseId]);
  
  // Load conference houses and buildings
  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      // Load conference houses from API
      const housesResponse = await conferenceHouseApi.list();
      if (!housesResponse.success || housesResponse.data.length === 0) {
        toastError('No conference houses found. Please create one first.');
        setLoading(false);
        return;
      }
      
      // Load buildings from API
      const buildingsResponse = await buildingApi.list();
      if (buildingsResponse.success) {
        setBuildings(buildingsResponse.data);
      }
      
      // Use the first conference house
      if (housesResponse.data.length > 0 && housesResponse.data[0]) {
        const houseId = housesResponse.data[0].id;
        setSelectedHouseId(houseId);
        await loadConfig(houseId);
        await loadStatus(houseId);
      }
    } catch (error) {
      toastError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  
  const loadConfig = async (houseId: string) => {
    try {
      const response = await autoAssignmentApi.getConfig(houseId);
      if (response.success && response.data) {
        const configData = response.data;
        
        if (configData.ruleWeights) {
          setRuleWeights({ ...DEFAULT_RULE_WEIGHTS, ...configData.ruleWeights });
        }
        
        if (configData.staffReservedCapacity !== undefined) {
          // Backend sends integer percentage (0-50), convert to decimal (0.0-0.5)
          setStaffReservedCapacity(configData.staffReservedCapacity / 100);
        }
        
        if (configData.enabledBuildings) {
          setSelectedBuildingIds(configData.enabledBuildings);
        }

        setBuildingGenderOverrides(configData.buildingGenderOverrides || {});
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };
  
  const loadStatus = async (houseId: string) => {
    try {
      const response = await autoAssignmentApi.getStatus(houseId);
      if (response.success && response.data) {
        setStatus(response.data);
      }
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };
  
  const handleBuildingToggle = (buildingId: string) => {
    setSelectedBuildingIds(prev => {
      if (prev.includes(buildingId)) {
        return prev.filter(id => id !== buildingId);
      } else {
        return [...prev, buildingId];
      }
    });
    setConfigDirty(true);
  };
  
  const handleBuildingGenderChange = (buildingId: string, gender: 'MALE' | 'FEMALE' | '') => {
    setBuildingGenderOverrides(prev => {
      const next = { ...prev };
      if (gender === '') {
        delete next[buildingId];
      } else {
        next[buildingId] = gender;
      }
      return next;
    });
    setConfigDirty(true);
  };

  const handleRuleWeightChange = (ruleName: string, value: number) => {
    setRuleWeights(prev => ({ ...prev, [ruleName]: value }));
    setConfigDirty(true);
  };
  
  const handleSaveConfig = async () => {
    if (!selectedHouseId) return;
    
    try {
      // Validate weights sum to 1.0
      const total = Object.values(ruleWeights).reduce((sum, w) => sum + w, 0);
      if (Math.abs(total - 1.0) > 0.01) {
        toastError('Rule weights must sum to 1.0');
        return;
      }
      
      await autoAssignmentApi.updateConfig(selectedHouseId, {
        enabledBuildings: selectedBuildingIds,
        buildingGenderOverrides,
        ruleWeights,
        // Backend expects integer percentage (0-50), convert from decimal (0.0-0.5)
        staffReservedCapacity: Math.round(staffReservedCapacity * 100),
      });
      
      toastSuccess('Configuration saved');
      setConfigDirty(false);
      await loadConfig(selectedHouseId);
    } catch (error) {
      toastError('Failed to save configuration');
    }
  };
  
  const handleExecute = async () => {
    if (!selectedHouseId) return;
    
    if (selectedBuildingIds.length === 0) {
      toastWarning('Please select at least one building');
      return;
    }
    
    if (configDirty) {
      toastWarning('Please save configuration before executing');
      return;
    }
    
    try {
      setIsExecuting(true);
      setExecutionResult(null);
      setProgressPercentage(0);
      setProgressMessage('Starting auto-assignment...');
      setCurrentStage('Initializing');
      
      // Join conference house room for progress updates
      if (socket) {
        socket.emit('join', selectedHouseId);
      } else {
        console.warn('⚠️ Socket not connected - progress updates may not work');
        toastWarning('Real-time updates unavailable - results will show when complete');
      }
      
      // Start a fallback timer for progress simulation if no WebSocket updates
      let fallbackProgress = 0;
      const fallbackInterval = setInterval(() => {
        fallbackProgress += 2;
        if (fallbackProgress <= 90) {
          setProgressPercentage(fallbackProgress);
          setProgressMessage('Processing assignments...');
        }
      }, 1000);
      
      const response = await autoAssignmentApi.execute({
        conferenceHouseId: selectedHouseId,
        buildingIds: selectedBuildingIds,
        buildingGenderOverrides,
        dryRun: false,
      });
      
      // Clear fallback timer
      clearInterval(fallbackInterval);
      
      // Handle result from HTTP response (fallback if socket event is missed)
      if (response.success && response.data) {
        setExecutionResult(response.data);
        setIsExecuting(false);
        setProgressPercentage(100);
        await loadStatus(selectedHouseId);
        toastSuccess(response.data.success 
          ? `Auto-assignment completed: ${response.data.assignmentsCreated} assignments created` 
          : 'Auto-assignment completed with errors'
        );
      }
    } catch (error: any) {
      setIsExecuting(false);
      setProgressPercentage(0);
      
      // Better error message
      if (error.message?.includes('timeout')) {
        toastError('Execution taking longer than expected - check server logs');
      } else {
        toastError(error.message || 'Failed to start auto-assignment');
      }
    }
  };
  
  const handlePreview = async () => {
    if (!selectedHouseId) return;
    
    if (selectedBuildingIds.length === 0) {
      toastWarning('Please select at least one building');
      return;
    }
    
    try {
      setIsPreviewing(true);
      setExecutionResult(null);
      setProgressPercentage(0);
      setProgressMessage('Starting preview (dry run)...');
      setCurrentStage('Initializing');
      
      // Join conference house room for progress updates
      if (socket) {
        socket.emit('join', selectedHouseId);
      } else {
        console.warn('⚠️ Socket not connected - progress updates may not work');
        toastWarning('Real-time updates unavailable - results will show when complete');
      }
      
      // Start a fallback timer for progress simulation if no WebSocket updates
      let fallbackProgress = 0;
      const fallbackInterval = setInterval(() => {
        fallbackProgress += 2;
        if (fallbackProgress <= 90) {
          setProgressPercentage(fallbackProgress);
          setProgressMessage('Processing assignments...');
        }
      }, 1000);
      
      console.log('🚀 Starting preview request...');
      const response = await autoAssignmentApi.preview({
        conferenceHouseId: selectedHouseId,
        buildingIds: selectedBuildingIds,
        buildingGenderOverrides,
        dryRun: true,
      });
      
      // Clear fallback timer
      clearInterval(fallbackInterval);
      
      console.log('✅ Preview response:', response);
      console.log('📊 Response data:', response.data);
      console.log('📝 Assignments:', response.data?.assignments);
      
      // Handle result from HTTP response (fallback if socket event is missed)
      if (response.success && response.data) {
        console.log('✅ Setting executionResult with', response.data.assignments?.length, 'assignments');
        
        // Save preview to localStorage (persists across page navigations)
        localStorage.setItem('autoAssignmentPreview', JSON.stringify(response.data));
        localStorage.setItem('autoAssignmentPreviewTimestamp', new Date().toISOString());
        
        setExecutionResult(response.data);
        setIsPreviewing(false);
        setProgressPercentage(100);
        await loadStatus(selectedHouseId);
        
        toastSuccess('Preview completed - opening full results page...');
        
        // Navigate to preview page with params
        navigate(`/auto-assignment/preview?houseId=${selectedHouseId}&buildingIds=${selectedBuildingIds.join(',')}`);
      } else {
        console.warn('⚠️ Preview response not successful or missing data:', response);
        setIsPreviewing(false);
        setProgressPercentage(0);
        toastError('Preview failed - no data returned');
      }
    } catch (error: any) {
      console.error('❌ Preview error:', error);
      setIsPreviewing(false);
      setProgressPercentage(0);
      
      // Better error message
      if (error.message?.includes('timeout')) {
        toastError('Preview taking longer than expected - check server logs');
      } else {
        toastError(error.message || 'Failed to start preview');
      }
    }
  };

  const handleConfirmAndExecute = async () => {
    if (!selectedHouseId) return;
    
    try {
      setIsExecuting(true);
      setProgressPercentage(0);
      setProgressMessage('Executing assignments and saving to database...');
      setCurrentStage('Saving to database');
      
      // Join conference house room for progress updates
      if (socket) {
        socket.emit('join', selectedHouseId);
      } else {
        console.warn('⚠️ Socket not connected - progress updates may not work');
      }
      
      // Start a fallback timer for progress simulation if no WebSocket updates
      let fallbackProgress = 0;
      const fallbackInterval = setInterval(() => {
        fallbackProgress += 2;
        if (fallbackProgress <= 90) {
          setProgressPercentage(fallbackProgress);
        }
      }, 1000);
      
      const response = await autoAssignmentApi.execute({
        conferenceHouseId: selectedHouseId,
        buildingIds: selectedBuildingIds,
        buildingGenderOverrides,
        dryRun: false,  // Actually save to database
      });
      
      // Clear fallback timer
      clearInterval(fallbackInterval);
      
      // Handle result from HTTP response
      if (response.success && response.data) {
        setExecutionResult(response.data);
        setIsExecuting(false);
        setProgressPercentage(100);
        await loadStatus(selectedHouseId);
        toastSuccess(`Successfully created ${response.data.assignmentsCreated} assignments!`);
      }
    } catch (error: any) {
      setIsExecuting(false);
      setProgressPercentage(0);
      
      // Better error message
      if (error.message?.includes('timeout')) {
        toastError('Execution taking longer than expected - check server logs');
      } else {
        toastError(error.message || 'Failed to execute assignments');
      }
    }
  };
  
  const weightsTotal = Object.values(ruleWeights).reduce((sum, w) => sum + w, 0);
  const isWeightsValid = Math.abs(weightsTotal - 1.0) < 0.01;
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="text-primary-600" size={32} />
            Auto-Assignment
          </h1>
          <p className="text-gray-600 mt-1">
            AI-powered automatic room assignment with smart grouping
          </p>
        </div>
      </div>
      
      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Total Attendees</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {status.totalAttendees}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Assigned</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {status.assignedAttendees}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Unassigned</div>
            <div className="text-2xl font-bold text-orange-600 mt-1">
              {status.unassignedAttendees}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Available Rooms</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {status.availableRooms}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Occupancy Rate</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {(status.occupancyRate * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      )}
      
      {/* Detailed Preview Table */}
      {executionResult && executionResult.assignments && executionResult.assignments.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Assignment Preview - {executionResult.assignments.length} Assignments
            </h2>
            <div className="text-sm text-gray-600">
              Review assignments before executing
            </div>
          </div>
          
          <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attendee</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Floor</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-96">Reasoning & Group Info</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {executionResult.assignments.map((assignment, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-sm text-gray-500">{idx + 1}</td>
                    <td className="px-3 py-3 text-sm font-medium text-gray-900">{assignment.attendeeName}</td>
                    <td className="px-3 py-3 text-sm text-gray-900">{assignment.roomNumber}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{assignment.buildingName}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{assignment.floorNumber}</td>
                    <td className="px-3 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        assignment.score >= 0.8 ? 'bg-green-100 text-green-800' :
                        assignment.score >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {(assignment.score * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      <div className="space-y-1">
                        {/* Group Badge */}
                        {assignment.groupInfo && assignment.groupInfo.groupType !== 'individual' && (
                          <div className="flex items-center gap-1 mb-1">
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
                              <span className="text-xs text-gray-600">
                                {assignment.groupInfo.roommatesInSameRoom}/{assignment.groupInfo.groupSize} together
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Reasoning Text */}
                        <div className="text-xs leading-relaxed whitespace-normal">
                          {assignment.reason || 'No reasoning available'}
                        </div>
                        
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
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Action buttons for preview */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleConfirmAndExecute}
              disabled={isExecuting}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
            >
              {isExecuting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Executing...
                </>
              ) : (
                <>
                  <Play size={18} />
                  Confirm & Execute These Assignments
                </>
              )}
            </button>
            
            <button
              onClick={() => setExecutionResult(null)}
              disabled={isExecuting}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <RotateCcw size={18} />
              Cancel
            </button>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Building Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Settings size={20} />
              Building Selection
            </h2>
            
            {/* Table Header/Columns */}
            <div className="hidden md:flex items-center gap-4 px-3 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50 rounded-lg mb-2">
              <div className="flex-1 min-w-[140px]">Building Name</div>
              <div className="w-16 text-right">Floors</div>
              <div className="w-24 text-right">Rooms</div>
              <div className="w-28 text-right">Beds</div>
              <div className="w-20 text-right">Capacity</div>
              <div className="w-36 text-right">Assign Gender</div>
            </div>

            <div className="space-y-2">
              {buildings
                .filter(b => b.conferenceHouseId === selectedHouseId)
                .map(building => {
                  const stats = getBuildingStats(building);
                  return (
                    <label key={building.id} className="flex flex-col md:flex-row md:flex-wrap gap-3 md:gap-4 md:items-center p-3 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-100 transition-colors">
                      <div className="w-full md:flex-1 md:min-w-[140px] flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedBuildingIds.includes(building.id)}
                          onChange={() => handleBuildingToggle(building.id)}
                          className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="font-semibold text-gray-900">{building.name}</span>
                      </div>
                      <div className="w-full flex items-center justify-between md:block md:w-16 md:text-right text-sm text-gray-600">
                        <span className="md:hidden text-xs text-gray-400">Floors</span>
                        <span>{building.floorCount} floors</span>
                      </div>
                      <div className="w-full flex items-center justify-between md:block md:w-24 md:text-right text-sm text-gray-600">
                        <span className="md:hidden text-xs text-gray-400">Available Rooms</span>
                        <span>
                          <span className="font-semibold text-primary-600">{stats.availableRooms}</span>
                          <span className="text-xs text-gray-400"> / {stats.totalRooms} rms</span>
                        </span>
                      </div>
                      <div className="w-full flex items-center justify-between md:block md:w-28 md:text-right text-sm text-gray-600">
                        <span className="md:hidden text-xs text-gray-400">Available Beds</span>
                        <span>
                          <span className="font-semibold text-green-600">{stats.availableBeds}</span>
                          <span className="text-xs text-gray-400"> / {stats.totalCapacity} empty</span>
                        </span>
                      </div>
                      <div className="w-full flex items-center justify-between md:block md:w-20 md:text-right text-sm text-gray-600">
                        <span className="md:hidden text-xs text-gray-400">Total Capacity</span>
                        <span>
                          <span className="font-semibold text-gray-950">{stats.totalCapacity}</span>
                          <span className="text-xs text-gray-400"> beds</span>
                        </span>
                      </div>
                      <div className="w-full flex items-center gap-2 md:block md:w-36">
                        <span className="md:hidden text-xs text-gray-400 shrink-0">Assign Gender</span>
                        <select
                          value={buildingGenderOverrides[building.id] || ''}
                          onChange={(e) =>
                            handleBuildingGenderChange(building.id, e.target.value as 'MALE' | 'FEMALE' | '')
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="input text-sm py-1.5 flex-1 md:w-full"
                          title="Manually pin which gender may be assigned to this building — leave on Auto to keep the existing first-come behavior"
                        >
                          <option value="">Auto</option>
                          <option value="MALE">Male only</option>
                          <option value="FEMALE">Female only</option>
                        </select>
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>
          
          {/* Rule Weights Configuration */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Settings size={20} />
                Assignment Rules
              </h2>
              <div className={`text-sm font-medium ${isWeightsValid ? 'text-green-600' : 'text-red-600'}`}>
                Total: {(weightsTotal * 100).toFixed(0)}% {isWeightsValid ? '✓' : '⚠'}
              </div>
            </div>
            
            <div className="space-y-3">
              {Object.entries(ruleWeights).map(([ruleName, weight]) => (
                <div key={ruleName} className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 flex-1">
                    {ruleName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={(weight * 100).toFixed(0)}
                      onChange={(e) => {
                        const percentage = parseFloat(e.target.value);
                        if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
                          handleRuleWeightChange(ruleName, percentage / 100);
                        }
                      }}
                      className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <span className="text-sm text-gray-600">%</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 pt-6 border-t">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 flex-1">
                  Staff Reserved Capacity
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="1"
                    value={(staffReservedCapacity * 100).toFixed(0)}
                    onChange={(e) => {
                      const percentage = parseFloat(e.target.value) || 0;
                      // Clamp value between 0 and 50
                      const clampedPercentage = Math.max(0, Math.min(50, percentage));
                      setStaffReservedCapacity(clampedPercentage / 100);
                      setConfigDirty(true);
                    }}
                    onBlur={(e) => {
                      // Ensure value is within range on blur
                      const percentage = parseFloat(e.target.value) || 0;
                      const clampedPercentage = Math.max(0, Math.min(50, percentage));
                      if (percentage !== clampedPercentage) {
                        setStaffReservedCapacity(clampedPercentage / 100);
                      }
                    }}
                    className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Percentage of room capacity reserved for staff members (max 50%)
              </p>
            </div>
            
            {configDirty && (
              <button
                onClick={handleSaveConfig}
                disabled={!isWeightsValid}
                className="mt-4 w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Save Configuration
              </button>
            )}
          </div>
        </div>
        
        {/* Execution Panel */}
        <div className="space-y-6">
          {/* Action Buttons */}
          <div className="bg-white rounded-lg shadow p-6 space-y-3">
            <button
              onClick={handlePreview}
              disabled={isExecuting || isPreviewing || selectedBuildingIds.length === 0}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <Eye size={20} />
              Preview (Dry Run)
            </button>
            
            <button
              onClick={handleExecute}
              disabled={isExecuting || isPreviewing || selectedBuildingIds.length === 0 || configDirty}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <Play size={20} />
              Execute Assignment
            </button>
            
            {configDirty && (
              <p className="text-xs text-amber-600 text-center">
                Save configuration before executing
              </p>
            )}
          </div>
          
          {/* Progress Display */}
          {(isExecuting || isPreviewing) && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                {isPreviewing ? 'Preview in Progress...' : 'Execution in Progress...'}
              </h3>
              
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{currentStage}</span>
                  <span>{progressPercentage.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
                </div>
              </div>
              
              <p className="text-xs text-gray-600">{progressMessage}</p>
            </div>
          )}
          
          {/* Results Summary */}
          {executionResult && !isExecuting && !isPreviewing && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className={`text-sm font-medium ${executionResult.success ? 'text-green-600' : 'text-red-600'}`}>
                    {executionResult.success ? 'Success' : 'Completed with Errors'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-gray-600">Assignments</span>
                  <span className="text-sm font-medium text-gray-900">
                    {executionResult.assignmentsCreated}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-gray-600">Rooms Used</span>
                  <span className="text-sm font-medium text-gray-900">
                    {executionResult.roomsUsed}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-gray-600">Execution Time</span>
                  <span className="text-sm font-medium text-gray-900">
                    {(executionResult.executionTimeMs / 1000).toFixed(2)}s
                  </span>
                </div>
                
                {executionResult.unassignedAttendees && executionResult.unassignedAttendees.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg">
                    <div className="text-sm font-medium text-amber-800 mb-2">
                      Unassigned: {executionResult.unassignedAttendees.length}
                    </div>
                    <div className="text-xs text-amber-700 space-y-1 max-h-32 overflow-y-auto">
                      {executionResult.unassignedAttendees.slice(0, 5).map((u, idx) => (
                        <div key={idx}>
                          {u.name}: {u.reason}
                        </div>
                      ))}
                      {executionResult.unassignedAttendees.length > 5 && (
                        <div className="text-amber-600">
                          +{executionResult.unassignedAttendees.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <button
                onClick={() => setExecutionResult(null)}
                className="mt-4 w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} />
                Clear Results
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
