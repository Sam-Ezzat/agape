/**
 * Rooms Management Page
 * 
 * WHY: Manage rooms within floors with capacity and type
 */

import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, RefreshCw, BedDouble } from 'lucide-react';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { Room, Floor, Building } from '@/types/api';
import { RoomType } from '@/types/api';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [filterFloorId, setFilterFloorId] = useState<string>('');
  const [filterBuildingId, setFilterBuildingId] = useState<string>('');
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  useEffect(() => {
    loadRooms();
    loadFloors();
    loadBuildings();
  }, []);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${baseUrl}/rooms`);
      const data = await response.json();
      setRooms(data.data || []);
    } catch (error) {
      toastError('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  const loadFloors = async () => {
    try {
      const response = await fetch(`${baseUrl}/floors`);
      const data = await response.json();
      setFloors(data.data || []);
    } catch (error) {
      toastError('Failed to load floors');
    }
  };

  const loadBuildings = async () => {
    try {
      const response = await fetch(`${baseUrl}/buildings`);
      const data = await response.json();
      setBuildings(data.data || []);
    } catch (error) {
      toastError('Failed to load buildings');
    }
  };

  const handleDelete = async (id: string, roomNumber: string) => {
    if (!confirm(`Are you sure you want to delete Room ${roomNumber}?`)) return;
    
    try {
      const response = await fetch(`${baseUrl}/rooms/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Delete failed');
      toastSuccess(`Room ${roomNumber} deleted successfully`);
      loadRooms();
    } catch (error) {
      toastError('Failed to delete room');
    }
  };

  const openCreateModal = () => {
    setEditingRoom(null);
    setShowModal(true);
  };

  const openEditModal = (room: Room) => {
    setEditingRoom(room);
    setShowModal(true);
  };

  // Filter rooms by building first, then by floor
  const filteredFloors = filterBuildingId
    ? floors.filter(f => f.buildingId === filterBuildingId)
    : floors;

  const filteredRooms = filterFloorId
    ? rooms.filter(r => r.floorId === filterFloorId)
    : filterBuildingId
    ? rooms.filter(r => filteredFloors.some(f => f.id === r.floorId))
    : rooms;

  const getRoomTypeColor = (type: RoomType) => {
    switch (type) {
      case RoomType.GENERAL: return 'bg-blue-100 text-blue-800';
      case RoomType.VIP: return 'bg-purple-100 text-purple-800';
      case RoomType.FAMILY: return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rooms</h1>
          <p className="text-gray-600 mt-1">Manage rooms with capacity and type</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadRooms} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button onClick={openCreateModal} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Room
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Filter by Building</label>
            <select
              value={filterBuildingId}
              onChange={(e) => {
                setFilterBuildingId(e.target.value);
                setFilterFloorId(''); // Reset floor filter when building changes
              }}
              className="input"
            >
              <option value="">All Buildings</option>
              {buildings.map(building => (
                <option key={building.id} value={building.id}>{building.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Filter by Floor</label>
            <select
              value={filterFloorId}
              onChange={(e) => setFilterFloorId(e.target.value)}
              className="input"
            >
              <option value="">All Floors</option>
              {filteredFloors.map(floor => (
                <option key={floor.id} value={floor.id}>
                  Floor {floor.floorNumber} - {floor.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No rooms found</p>
          <button onClick={openCreateModal} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create First Room
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRooms.map(room => {
            const floor = floors.find(f => f.id === room.floorId);
            const building = buildings.find(b => b.id === floor?.buildingId);
            
            return (
              <div key={room.id} className="card">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <BedDouble className="w-5 h-5 text-primary-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      Room {room.roomNumber}
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(room)}
                      className="text-primary-600 hover:text-primary-700"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(room.id, room.roomNumber)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${getRoomTypeColor(room.roomType)}`}>
                    {room.roomType}
                  </span>
                  
                  <div className="text-sm text-gray-600">
                    <p>Capacity: {room.capacity} person{room.capacity > 1 ? 's' : ''}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {building?.name} - Floor {floor?.floorNumber}
                    </p>
                  </div>
                  
                  <div className="text-xs text-gray-400 pt-2 border-t">
                    Created: {new Date(room.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <RoomModal
          room={editingRoom}
          floors={floors}
          buildings={buildings}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            loadRooms();
          }}
        />
      )}
    </div>
  );
}

interface RoomModalProps {
  room: Room | null;
  floors: Floor[];
  buildings: Building[];
  onClose: () => void;
  onSave: () => void;
}

function RoomModal({ room, floors, buildings, onClose, onSave }: RoomModalProps) {
  const [formData, setFormData] = useState({
    roomNumber: room?.roomNumber || '',
    floorId: room?.floorId || '',
    capacity: room?.capacity || 1,
    roomType: room?.roomType || RoomType.GENERAL,
  });

  const [selectedBuildingId, setSelectedBuildingId] = useState(() => {
    if (room && room.floorId) {
      const foundFloor = floors.find(f => f.id === room.floorId);
      return foundFloor?.buildingId || '';
    }
    return '';
  });
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  // Filter floors by selected building
  const filteredFloors = selectedBuildingId
    ? floors.filter(f => f.buildingId === selectedBuildingId)
    : floors;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const submitData = {
        roomNumber: formData.roomNumber,
        floorId: formData.floorId,
        capacity: formData.capacity,
        roomType: formData.roomType,
      };

      const url = room
        ? `${baseUrl}/rooms/${room.id}`
        : `${baseUrl}/rooms`;
      
      const response = await fetch(url, {
        method: room ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) throw new Error('Save failed');
      
      toastSuccess(`Room ${room ? 'updated' : 'created'} successfully`);
      onSave();
    } catch (error) {
      toastError(`Failed to ${room ? 'update' : 'create'} room`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          {room ? 'Edit Room' : 'Create Room'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Room Number *</label>
            <input
              type="text"
              required
              value={formData.roomNumber}
              onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
              className="input"
              placeholder="e.g., 101, A-205"
            />
          </div>

          <div>
            <label className="label">Building (for filtering)</label>
            <select
              value={selectedBuildingId}
              onChange={(e) => {
                setSelectedBuildingId(e.target.value);
                setFormData({ ...formData, floorId: '' }); // Reset floor when building changes
              }}
              className="input"
            >
              <option value="">Select a building</option>
              {buildings.map(building => (
                <option key={building.id} value={building.id}>{building.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Floor *</label>
            <select
              required
              value={formData.floorId}
              onChange={(e) => setFormData({ ...formData, floorId: e.target.value })}
              className="input"
            >
              <option value="">Select a floor</option>
              {filteredFloors.map(floor => (
                <option key={floor.id} value={floor.id}>
                  Floor {floor.floorNumber} - {floor.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Capacity *</label>
            <input
              type="number"
              required
              min="1"
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
              className="input"
              placeholder="Number of people"
            />
          </div>

          <div>
            <label className="label">Room Type *</label>
            <select
              required
              value={formData.roomType}
              onChange={(e) => setFormData({ ...formData, roomType: e.target.value as RoomType })}
              className="input"
            >
              <option value={RoomType.GENERAL}>General</option>
              <option value={RoomType.VIP}>VIP</option>
              <option value={RoomType.FAMILY}>Family</option>
            </select>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {room ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
