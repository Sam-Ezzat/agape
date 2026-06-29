/**
 * Assignments Page - Redesigned Split Layout
 * 
 * WHY: Interface for managing room assignments with drag-and-drop
 * Left panel: Attendees (Unassigned / Assigned tabs) with search
 * Right panel: Room browser with Conference House → Building → Floor → Room hierarchy
 */

import { useEffect, useState } from 'react';
import { assignmentApi, attendeeApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { RoomAssignment, Attendee, ConferenceHouse, Building, Floor, Room } from '@/types/api';

export default function AssignmentsPage() {
  // Attendees (left panel)
  const [allAttendees, setAllAttendees] = useState<Attendee[]>([]);
  const [unassignedAttendees, setUnassignedAttendees] = useState<Attendee[]>([]);
  const [assignedAttendees, setAssignedAttendees] = useState<Attendee[]>([]);
  const [assignments, setAssignments] = useState<RoomAssignment[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'unassigned' | 'assigned'>('unassigned');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAttendeeId, setSelectedAttendeeId] = useState<string | null>(null);

  // Structure (right panel)
  const [houses, setHouses] = useState<ConferenceHouse[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [structureLoading, setStructureLoading] = useState(true);

  // Right panel filters
  const [selectedHouseId, setSelectedHouseId] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState('');

  // Drag state
  const [draggedAttendee, setDraggedAttendee] = useState<Attendee | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([
      loadAttendeesAndAssignments(),
      loadStructure(),
    ]);
  };

  const loadAttendeesAndAssignments = async () => {
    try {
      setAttendeesLoading(true);
      
      // Load all assignments (unpaginated)
      const assignmentsRes = await assignmentApi.list({ limit: '9999' });
      const allAssignments = assignmentsRes.data;
      setAssignments(allAssignments);

      // Load unassigned attendees
      const unassignedRes = await attendeeApi.getUnassigned();
      const unassigned = unassignedRes.data;
      setUnassignedAttendees(unassigned);

      // Build assigned attendees from assignments
      const assigned: Attendee[] = allAssignments
        .filter(a => a.attendee)
        .map(a => a.attendee!)
        .filter((a): a is Attendee => a !== undefined);
      setAssignedAttendees(assigned);

      // Combine all attendees
      setAllAttendees([...unassigned, ...assigned]);
    } catch (error) {
      toastError('Failed to load attendees');
    } finally {
      setAttendeesLoading(false);
    }
  };

  const loadStructure = async () => {
    try {
      setStructureLoading(true);
      
      const [housesRes, buildingsRes, floorsRes, roomsRes] = await Promise.all([
        fetch('http://localhost:3000/api/conference-houses').then(r => r.json()),
        fetch('http://localhost:3000/api/buildings').then(r => r.json()),
        fetch('http://localhost:3000/api/floors').then(r => r.json()),
        fetch('http://localhost:3000/api/rooms').then(r => r.json()),
      ]);

      setHouses(housesRes.data || []);
      setBuildings(buildingsRes.data || []);
      setFloors(floorsRes.data || []);
      setRooms(roomsRes.data || []);
    } catch (error) {
      toastError('Failed to load structure');
    } finally {
      setStructureLoading(false);
    }
  };

  const handleAssignToRoom = async (attendeeId: string, roomId: string) => {
    try {
      await assignmentApi.create({ attendeeId, roomId });
      toastSuccess('Attendee assigned successfully');
      await loadAttendeesAndAssignments();
      setSelectedAttendeeId(null);
      setDraggedAttendee(null);
    } catch (error) {
      // Error already shown by API service
    }
  };

  const handleUnassign = async (assignmentId: string, attendeeName: string) => {
    try {
      await assignmentApi.delete(assignmentId);
      toastSuccess(`${attendeeName} unassigned`);
      await loadAttendeesAndAssignments();
    } catch (error) {
      // Error already shown by API service
    }
  };

  // Drag handlers
  const onDragStart = (attendee: Attendee) => {
    setDraggedAttendee(attendee);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (roomId: string) => {
    if (draggedAttendee) {
      handleAssignToRoom(draggedAttendee.id, roomId);
    }
  };

  // Filter attendees by search
  const filteredUnassigned = unassignedAttendees.filter(a =>
    a.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.church && a.church.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (a.phone && a.phone.includes(searchQuery))
  );

  const filteredAssigned = assignedAttendees.filter(a =>
    a.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.church && a.church.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (a.phone && a.phone.includes(searchQuery))
  );

  // Filter structure cascade
  const filteredBuildings = selectedHouseId
    ? buildings.filter(b => b.conferenceHouseId === selectedHouseId)
    : buildings;

  const filteredFloors = selectedBuildingId
    ? floors.filter(f => f.buildingId === selectedBuildingId)
    : selectedHouseId
    ? floors.filter(f => filteredBuildings.some(b => b.id === f.buildingId))
    : floors;

  const filteredRooms = selectedFloorId
    ? rooms.filter(r => r.floorId === selectedFloorId)
    : selectedBuildingId
    ? rooms.filter(r => filteredFloors.some(f => f.id === r.floorId))
    : selectedHouseId
    ? rooms.filter(r => filteredFloors.some(f => f.id === r.floorId))
    : rooms;

  // Compute occupancy per room
  const getRoomOccupancy = (roomId: string): number => {
    return assignments.filter(a => a.roomId === roomId).length;
  };

  const getRoomAssignments = (roomId: string): RoomAssignment[] => {
    return assignments.filter(a => a.roomId === roomId);
  };

  const handleHouseChange = (houseId: string) => {
    setSelectedHouseId(houseId);
    setSelectedBuildingId('');
    setSelectedFloorId('');
  };

  const handleBuildingChange = (buildingId: string) => {
    setSelectedBuildingId(buildingId);
    setSelectedFloorId('');
  };

  const handleFloorChange = (floorId: string) => {
    setSelectedFloorId(floorId);
  };

  const clearFilters = () => {
    setSelectedHouseId('');
    setSelectedBuildingId('');
    setSelectedFloorId('');
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* LEFT PANEL - Attendees */}
      <div className="w-1/3 min-w-[360px] flex flex-col bg-white rounded-lg shadow-sm border">
        {/* Header */}
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Attendees</h2>
          
          {/* Search */}
          <div className="mt-3">
            <input
              type="text"
              placeholder="Search attendees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full"
            />
          </div>

          {/* Tabs */}
          <div className="flex mt-3 border-b">
            <button
              onClick={() => setActiveTab('unassigned')}
              className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'unassigned'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Unassigned ({unassignedAttendees.length})
            </button>
            <button
              onClick={() => setActiveTab('assigned')}
              className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'assigned'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Assigned ({assignedAttendees.length})
            </button>
          </div>
        </div>

        {/* Attendee List */}
        <div className="flex-1 overflow-y-auto p-2">
          {attendeesLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-2 text-gray-600 text-sm">Loading...</p>
            </div>
          ) : activeTab === 'unassigned' ? (
            filteredUnassigned.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">
                  {searchQuery ? 'No matching unassigned attendees' : 'All attendees are assigned!'}
                </p>
              </div>
            ) : (
              filteredUnassigned.map(attendee => (
                <div
                  key={attendee.id}
                  draggable
                  onDragStart={() => onDragStart(attendee)}
                  onClick={() => setSelectedAttendeeId(selectedAttendeeId === attendee.id ? null : attendee.id)}
                  className={`p-3 mb-1 rounded-lg cursor-pointer border-2 transition-all ${
                    selectedAttendeeId === attendee.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                  } ${draggedAttendee?.id === attendee.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{attendee.fullName}</p>
                      <p className="text-xs text-gray-500">
                        {attendee.conferenceRole || 'Attendee'}
                        {attendee.church && ` • ${attendee.church}`}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                      Unassigned
                    </span>
                  </div>
                </div>
              ))
            )
          ) : (
            filteredAssigned.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">
                  {searchQuery ? 'No matching assigned attendees' : 'No attendees assigned yet'}
                </p>
              </div>
            ) : (
              filteredAssigned.map(attendee => {
                const assignment = assignments.find(a => a.attendeeId === attendee.id);
                const room = rooms.find(r => r.id === assignment?.roomId);
                const floor = room ? floors.find(f => f.id === room.floorId) : null;
                const building = floor ? buildings.find(b => b.id === floor.buildingId) : null;
                
                return (
                  <div
                    key={attendee.id}
                    className="p-3 mb-1 rounded-lg border border-gray-100 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{attendee.fullName}</p>
                        <p className="text-xs text-gray-500">
                          {room && `Room ${room.roomNumber}`}
                          {building && ` • ${building.name}`}
                        </p>
                      </div>
                      <button
                        onClick={() => assignment && handleUnassign(assignment.id, attendee.fullName)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Unassign
                      </button>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Selection hint */}
        {selectedAttendeeId && activeTab === 'unassigned' && (
          <div className="p-3 border-t bg-primary-50">
            <p className="text-xs text-primary-700">
              Click a room on the right to assign, or drag this attendee to a room
            </p>
          </div>
        )}
      </div>

      {/* RIGHT PANEL - Rooms */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border">
        {/* Header & Filters */}
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Rooms</h2>
          
          {/* Filter cascade */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Conference House</label>
              <select
                value={selectedHouseId}
                onChange={(e) => handleHouseChange(e.target.value)}
                className="input w-full text-sm"
              >
                <option value="">All Houses</option>
                {houses.map(house => (
                  <option key={house.id} value={house.id}>{house.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Building</label>
              <select
                value={selectedBuildingId}
                onChange={(e) => handleBuildingChange(e.target.value)}
                className="input w-full text-sm"
                disabled={!selectedHouseId && filteredBuildings.length === 0}
              >
                <option value="">All Buildings</option>
                {filteredBuildings.map(building => (
                  <option key={building.id} value={building.id}>{building.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Floor</label>
              <select
                value={selectedFloorId}
                onChange={(e) => handleFloorChange(e.target.value)}
                className="input w-full text-sm"
                disabled={!selectedBuildingId && filteredFloors.length === 0}
              >
                <option value="">All Floors</option>
                {filteredFloors.map(floor => (
                  <option key={floor.id} value={floor.id}>
                    Floor {floor.floorNumber}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={clearFilters} className="btn-secondary w-full text-sm">
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Room Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {structureLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-2 text-gray-600 text-sm">Loading rooms...</p>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="mt-2 text-gray-500">No rooms found with current filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredRooms.map(room => {
                const occupancy = getRoomOccupancy(room.id);
                const roomAssignments = getRoomAssignments(room.id);
                const floor = floors.find(f => f.id === room.floorId);
                const building = floor ? buildings.find(b => b.id === floor.buildingId) : null;
                const house = building ? houses.find(h => h.id === building.conferenceHouseId) : null;
                const isFull = occupancy >= room.capacity;
                const isEmpty = occupancy === 0;

                return (
                  <div
                    key={room.id}
                    onDragOver={onDragOver}
                    onDrop={() => onDrop(room.id)}
                    onClick={() => {
                      if (selectedAttendeeId && !isFull) {
                        handleAssignToRoom(selectedAttendeeId, room.id);
                      }
                    }}
                    className={`border-2 rounded-lg p-4 transition-all ${
                      isFull
                        ? 'border-red-200 bg-red-50 cursor-not-allowed'
                        : selectedAttendeeId && !isFull
                        ? 'border-primary-400 bg-primary-50 cursor-pointer hover:border-primary-500 hover:shadow-md'
                        : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                    } ${draggedAttendee && !isFull ? 'border-dashed border-primary-400 bg-primary-50' : ''}`}
                  >
                    {/* Room header */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">Room {room.roomNumber}</h3>
                        <p className="text-xs text-gray-500">
                          {house?.name && `${house.name} → `}
                          {building?.name && `${building.name} → `}
                          Floor {floor?.floorNumber}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        isFull
                          ? 'bg-red-100 text-red-700'
                          : isEmpty
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {occupancy}/{room.capacity}
                      </span>
                    </div>

                    {/* Room type */}
                    <span className="inline-block text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mb-3">
                      {room.roomType}
                    </span>

                    {/* Assigned attendees in this room */}
                    {roomAssignments.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-500 mb-2">Assigned:</p>
                        <div className="space-y-1">
                          {roomAssignments.map(assignment => (
                            <div key={assignment.id} className="flex items-center justify-between text-xs">
                              <span className="text-gray-700 truncate mr-2">
                                {assignment.attendee?.fullName || 'Unknown'}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnassign(assignment.id, assignment.attendee?.fullName || 'attendee');
                                }}
                                className="text-red-500 hover:text-red-700 flex-shrink-0"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Drop hint */}
                    {draggedAttendee && !isFull && (
                      <p className="text-xs text-primary-600 mt-2 font-medium">
                        Drop to assign here
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}