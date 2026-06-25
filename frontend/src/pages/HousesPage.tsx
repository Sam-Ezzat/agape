/**
 * Conference Houses Management Page
 * 
 * WHY: Manage conference houses - the top-level infrastructure
 */

import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { ConferenceHouse } from '@/types/api';

export default function HousesPage() {
  const [houses, setHouses] = useState<ConferenceHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingHouse, setEditingHouse] = useState<ConferenceHouse | null>(null);

  useEffect(() => {
    loadHouses();
  }, []);

  const loadHouses = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3000/api/conference-houses');
      const data = await response.json();
      setHouses(data.data || []);
    } catch (error) {
      toastError('Failed to load conference houses');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    
    try {
      const response = await fetch(`http://localhost:3000/api/conference-houses/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Delete failed');
      toastSuccess(`${name} deleted successfully`);
      loadHouses();
    } catch (error) {
      toastError('Failed to delete conference house');
    }
  };

  const openCreateModal = () => {
    setEditingHouse(null);
    setShowModal(true);
  };

  const openEditModal = (house: ConferenceHouse) => {
    setEditingHouse(house);
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Conference Houses</h1>
          <p className="text-gray-600 mt-1">Manage conference house locations</p>
        </div>
        <div className="flex gap-3">
          <button onClick={loadHouses} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={18} />
            Refresh
          </button>
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            Add House
          </button>
        </div>
      </div>

      {/* Houses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : houses.length === 0 ? (
          <div className="col-span-full text-center py-12 card">
            <p className="text-gray-500">No conference houses found</p>
            <button onClick={openCreateModal} className="btn-primary mt-4">
              Create First House
            </button>
          </div>
        ) : (
          houses.map((house) => (
            <div key={house.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">{house.name}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(house)}
                    className="text-gray-600 hover:text-primary-600"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(house.id, house.name)}
                    className="text-gray-600 hover:text-red-600"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              {house.description && (
                <p className="text-sm text-gray-600 mb-3">{house.description}</p>
              )}
              <div className="text-xs text-gray-500">
                Created {new Date(house.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <HouseModal
          house={editingHouse}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            loadHouses();
          }}
        />
      )}
    </div>
  );
}

// House Modal Component
function HouseModal({ house, onClose, onSave }: { 
  house: ConferenceHouse | null; 
  onClose: () => void; 
  onSave: () => void;
}) {
  const [name, setName] = useState(house?.name || '');
  const [description, setDescription] = useState(house?.description || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toastError('Please enter a name');
      return;
    }

    try {
      setSaving(true);
      const url = house
        ? `http://localhost:3000/api/conference-houses/${house.id}`
        : 'http://localhost:3000/api/conference-houses';
      
      const response = await fetch(url, {
        method: house ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });

      if (!response.ok) throw new Error('Save failed');
      
      toastSuccess(`House ${house ? 'updated' : 'created'} successfully`);
      onSave();
    } catch (error) {
      toastError(`Failed to ${house ? 'update' : 'create'} house`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">
          {house ? 'Edit Conference House' : 'New Conference House'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Conference Center"
              className="input w-full"
            />
          </div>
          
          <div>
            <label className="label">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
              className="input w-full"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
