/**
 * Floors Management Page
 * 
 * WHY: Manage floors within buildings
 */

import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { Floor, Building } from '@/types/api';

export default function FloorsPage() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);
  const [filterBuildingId, setFilterBuildingId] = useState<string>('');

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  useEffect(() => {
    loadFloors();
    loadBuildings();
  }, []);

  const loadFloors = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${baseUrl}/floors`);
      const data = await response.json();
      setFloors(data.data || []);
    } catch (error) {
      toastError('Failed to load floors');
    } finally {
      setLoading(false);
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

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}? This will also delete all rooms on this floor.`)) return;
    
    try {
      const response = await fetch(`${baseUrl}/floors/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Delete failed');
      toastSuccess(`${name} deleted successfully`);
      loadFloors();
    } catch (error) {
      toastError('Failed to delete floor');
    }
  };

  const openCreateModal = () => {
    setEditingFloor(null);
    setShowModal(true);
  };

  const openEditModal = (floor: Floor) => {
    setEditingFloor(floor);
    setShowModal(true);
  };

  const filteredFloors = filterBuildingId
    ? floors.filter(f => f.buildingId === filterBuildingId)
    : floors;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Floors</h1>
          <p className="text-gray-600 mt-1">Manage floors within buildings</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadFloors} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button onClick={openCreateModal} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Floor
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border">
        <label className="label">Filter by Building</label>
        <select
          value={filterBuildingId}
          onChange={(e) => setFilterBuildingId(e.target.value)}
          className="input"
        >
          <option value="">All Buildings</option>
          {buildings.map(building => (
            <option key={building.id} value={building.id}>{building.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredFloors.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No floors found</p>
          <button onClick={openCreateModal} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create First Floor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredFloors.map(floor => (
            <div key={floor.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Floor {floor.floorNumber}
                  </h3>
                  <p className="text-sm text-gray-600">{floor.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {buildings.find(b => b.id === floor.buildingId)?.name || 'Unknown Building'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(floor)}
                    className="text-primary-600 hover:text-primary-700"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(floor.id, floor.name)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-400">
                Created: {new Date(floor.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <FloorModal
          floor={editingFloor}
          buildings={buildings}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            loadFloors();
          }}
        />
      )}
    </div>
  );
}

interface FloorModalProps {
  floor: Floor | null;
  buildings: Building[];
  onClose: () => void;
  onSave: () => void;
}

function FloorModal({ floor, buildings, onClose, onSave }: FloorModalProps) {
  const [formData, setFormData] = useState({
    floorNumber: floor?.floorNumber || 1,
    name: floor?.name || '',
    buildingId: floor?.buildingId || '',
  });
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = floor
        ? `${baseUrl}/floors/${floor.id}`
        : `${baseUrl}/floors`;
      
      const response = await fetch(url, {
        method: floor ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Save failed');
      
      toastSuccess(`Floor ${floor ? 'updated' : 'created'} successfully`);
      onSave();
    } catch (error) {
      toastError(`Failed to ${floor ? 'update' : 'create'} floor`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {floor ? 'Edit Floor' : 'Create Floor'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Building *</label>
            <select
              required
              value={formData.buildingId}
              onChange={(e) => setFormData({ ...formData, buildingId: e.target.value })}
              className="input"
            >
              <option value="">Select a building</option>
              {buildings.map(building => (
                <option key={building.id} value={building.id}>{building.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Floor Number *</label>
            <input
              type="number"
              required
              min="0"
              value={formData.floorNumber}
              onChange={(e) => setFormData({ ...formData, floorNumber: parseInt(e.target.value) })}
              className="input"
              placeholder="e.g., 1, 2, 3"
            />
          </div>

          <div>
            <label className="label">Floor Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="e.g., Ground Floor, First Floor"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {floor ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
