/**
 * Buildings Management Page
 * 
 * WHY: Manage buildings within conference houses
 */

import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { Building, ConferenceHouse } from '@/types/api';

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [houses, setHouses] = useState<ConferenceHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [filterHouseId, setFilterHouseId] = useState<string>('');

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  useEffect(() => {
    loadBuildings();
    loadHouses();
  }, []);

  const loadBuildings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${baseUrl}/buildings`, { credentials: 'include' });
      const data = await response.json();
      setBuildings(data.data || []);
    } catch (error) {
      toastError('Failed to load buildings');
    } finally {
      setLoading(false);
    }
  };

  const loadHouses = async () => {
    try {
      const response = await fetch(`${baseUrl}/conference-houses`, { credentials: 'include' });
      const data = await response.json();
      setHouses(data.data || []);
    } catch (error) {
      toastError('Failed to load conference houses');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}? This will also delete all floors and rooms in this building.`)) return;
    
    try {
      const response = await fetch(`${baseUrl}/buildings/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Delete failed');
      toastSuccess(`${name} deleted successfully`);
      loadBuildings();
    } catch (error) {
      toastError('Failed to delete building');
    }
  };

  const openCreateModal = () => {
    setEditingBuilding(null);
    setShowModal(true);
  };

  const openEditModal = (building: Building) => {
    setEditingBuilding(building);
    setShowModal(true);
  };

  const filteredBuildings = filterHouseId
    ? buildings.filter(b => b.conferenceHouseId === filterHouseId)
    : buildings;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Buildings</h1>
          <p className="text-gray-600 mt-1">Manage buildings within conference houses</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadBuildings} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button onClick={openCreateModal} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Building
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border">
        <label className="label">Filter by Conference House</label>
        <select
          value={filterHouseId}
          onChange={(e) => setFilterHouseId(e.target.value)}
          className="input"
        >
          <option value="">All Conference Houses</option>
          {houses.map(house => (
            <option key={house.id} value={house.id}>{house.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredBuildings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No buildings found</p>
          <button onClick={openCreateModal} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create First Building
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBuildings.map(building => (
            <div key={building.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{building.name}</h3>
                  <p className="text-sm text-gray-500">
                    {houses.find(h => h.id === building.conferenceHouseId)?.name || 'Unknown House'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(building)}
                    className="text-primary-600 hover:text-primary-700"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(building.id, building.name)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <p>Floor Count: {building.floorCount}</p>
                <p className="text-xs text-gray-400">
                  Created: {new Date(building.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <BuildingModal
          building={editingBuilding}
          houses={houses}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            loadBuildings();
          }}
        />
      )}
    </div>
  );
}

interface BuildingModalProps {
  building: Building | null;
  houses: ConferenceHouse[];
  onClose: () => void;
  onSave: () => void;
}

function BuildingModal({ building, houses, onClose, onSave }: BuildingModalProps) {
  const [formData, setFormData] = useState({
    name: building?.name || '',
    conferenceHouseId: building?.conferenceHouseId || '',
    floorCount: building?.floorCount || 1,
  });
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = building
        ? `${baseUrl}/buildings/${building.id}`
        : `${baseUrl}/buildings`;
      
      const response = await fetch(url, {
        method: building ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Save failed');
      
      toastSuccess(`Building ${building ? 'updated' : 'created'} successfully`);
      onSave();
    } catch (error) {
      toastError(`Failed to ${building ? 'update' : 'create'} building`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {building ? 'Edit Building' : 'Create Building'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Building Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="e.g., Main Building, North Wing"
            />
          </div>

          <div>
            <label className="label">Conference House *</label>
            <select
              required
              value={formData.conferenceHouseId}
              onChange={(e) => setFormData({ ...formData, conferenceHouseId: e.target.value })}
              className="input"
            >
              <option value="">Select a conference house</option>
              {houses.map(house => (
                <option key={house.id} value={house.id}>{house.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Floor Count</label>
            <input
              type="number"
              min="1"
              value={formData.floorCount}
              onChange={(e) => setFormData({ ...formData, floorCount: parseInt(e.target.value) })}
              className="input"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {building ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
