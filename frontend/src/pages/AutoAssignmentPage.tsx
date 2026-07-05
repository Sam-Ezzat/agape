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
import { useSocket } from '@/hooks/useSocket';
import { autoAssignmentApi, conferenceHouseApi, buildingApi } from '@/services/api.service';
import { toastSuccess, toastError, toastWarning } from '@/services/toast.service';
import type {
  AutoAssignmentExecutionResult,
  AutoAssignmentStatus,
  Building,
} from '@/types/api';
import {
  NotificationEvent,
  type AutoAssignmentProgressNotification,
} from '@/types/notifications';
import { Play, Eye, Settings, RotateCcw, Zap } from 'lucide-react';

// WHY: Default rule weights for new configurations
const DEFAULT_RULE_WEIGHTS = {
  SameChurchRule: 0.25,
  SameGovernorateRule: 0.15,
  SimilarAgeRule: 0.20,
  MinimizeEmptyBedsRule: 0.15,
  PreferSameFloorRule: 0.15,
  LeaderProximityRule: 0.10,
};

export default function AutoAssignmentPage() {
  // State
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<string>('');
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([]);
  
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
  
  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);
  
  // Subscribe to auto-assignment progress events
  useEffect(() => {
    if (!socket) return;
    
    const handleProgress = (payload: AutoAssignmentProgressNotification) => {
      const { stage, progress, currentAction } = payload.data;
      
      setCurrentStage(stage);
      if (progress) {
        setProgressPercentage(progress.percentage);
      }
      if (currentAction) {
        setProgressMessage(currentAction);
      }
    };
    
    const handleComplete = (payload: any) => {
      setIsExecuting(false);
      setIsPreviewing(false);
      
      if (payload.data?.result) {
        setExecutionResult(payload.data.result);
      }
      
      // Reload status
      if (selectedHouseId) {
        loadStatus(selectedHouseId);
      }
      
      toastSuccess(payload.message || 'Auto-assignment completed');
    };
    
    const handleError = (payload: any) => {
      setIsExecuting(false);
      setIsPreviewing(false);
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
          setStaffReservedCapacity(configData.staffReservedCapacity);
        }
        
        if (configData.enabledBuildings) {
          setSelectedBuildingIds(configData.enabledBuildings);
        }
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
        ruleWeights,
        staffReservedCapacity,
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
      
      // Join conference house room for progress updates
      if (socket) {
        socket.emit('join', selectedHouseId);
      }
      
      await autoAssignmentApi.execute({
        conferenceHouseId: selectedHouseId,
        buildingIds: selectedBuildingIds,
        dryRun: false,
      });
      
      // Result will be handled by socket event
    } catch (error) {
      setIsExecuting(false);
      toastError('Failed to start auto-assignment');
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
      
      // Join conference house room for progress updates
      if (socket) {
        socket.emit('join', selectedHouseId);
      }
      
      await autoAssignmentApi.preview({
        conferenceHouseId: selectedHouseId,
        buildingIds: selectedBuildingIds,
        dryRun: true,
      });
      
      // Result will be handled by socket event
    } catch (error) {
      setIsPreviewing(false);
      toastError('Failed to start preview');
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
        
        {status && (
          <div className="text-right">
            <div className="text-sm text-gray-600">Unassigned Attendees</div>
            <div className="text-3xl font-bold text-primary-600">
              {status.unassignedAttendees}
            </div>
          </div>
        )}
      </div>
      
      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-4 gap-4">
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
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Building Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Settings size={20} />
              Building Selection
            </h2>
            
            <div className="space-y-2">
              {buildings
                .filter(b => b.conferenceHouseId === selectedHouseId)
                .map(building => (
                  <label key={building.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBuildingIds.includes(building.id)}
                      onChange={() => handleBuildingToggle(building.id)}
                      className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="flex-1 font-medium text-gray-900">{building.name}</span>
                    <span className="text-sm text-gray-500">{building.floorCount} floors</span>
                  </label>
                ))}
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
                Total: {weightsTotal.toFixed(2)} {isWeightsValid ? '✓' : '⚠'}
              </div>
            </div>
            
            <div className="space-y-4">
              {Object.entries(ruleWeights).map(([ruleName, weight]) => (
                <div key={ruleName}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">
                      {ruleName.replace(/Rule$/, '')}
                    </label>
                    <span className="text-sm text-gray-600">{weight.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weight}
                    onChange={(e) => handleRuleWeightChange(ruleName, parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              ))}
            </div>
            
            <div className="mt-6 pt-6 border-t">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Staff Reserved Capacity
                </label>
                <span className="text-sm text-gray-600">
                  {(staffReservedCapacity * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={staffReservedCapacity}
                onChange={(e) => {
                  setStaffReservedCapacity(parseFloat(e.target.value));
                  setConfigDirty(true);
                }}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">
                Percentage of room capacity reserved for staff members
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
          
          {/* Results Display */}
          {executionResult && !isExecuting && !isPreviewing && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Results</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className={`text-sm font-medium ${executionResult.success ? 'text-green-600' : 'text-red-600'}`}>
                    {executionResult.success ? 'Success' : 'Completed with Errors'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-gray-600">Assignments Created</span>
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
                
                {executionResult.unassignedAttendees.length > 0 && (
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
