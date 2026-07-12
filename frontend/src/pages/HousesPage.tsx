/**
 * Conference Houses Management Page
 * 
 * WHY: Manage conference houses - the top-level infrastructure
 */

import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, RefreshCw, Upload, Download, FileSpreadsheet } from 'lucide-react';
import { toastSuccess, toastError } from '@/services/toast.service';
import { excelApi } from '@/services/api.service';
import type { ConferenceHouse } from '@/types/api';

export default function HousesPage() {
  const [houses, setHouses] = useState<ConferenceHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingHouse, setEditingHouse] = useState<ConferenceHouse | null>(null);
  
  // State for import modal UI & progress tracking
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedHouseIdForImport, setSelectedHouseIdForImport] = useState<string | null>(null);

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  useEffect(() => {
    loadHouses();
  }, []);

  const loadHouses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${baseUrl}/conference-houses`);
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
      const response = await fetch(`${baseUrl}/conference-houses/${id}`, {
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

  const handleDownloadTemplate = () => {
    window.open(`${baseUrl}/excel/rooms/template`, '_blank');
  };

  const handleExportRooms = (houseId: string) => {
    window.open(`${baseUrl}/excel/rooms/export?conferenceHouseId=${houseId}`, '_blank');
  };

  const triggerImportRooms = (houseId: string) => {
    setSelectedHouseIdForImport(houseId);
    setShowImportModal(true);
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

              <div className="mt-4 pt-4 border-t flex flex-col gap-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Rooms Layout (Excel)
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => handleDownloadTemplate()}
                    className="flex items-center gap-1 text-primary-600 hover:text-primary-800 font-medium py-1"
                  >
                    <Download size={14} />
                    Template
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => handleExportRooms(house.id)}
                    className="flex items-center gap-1 text-green-600 hover:text-green-800 font-medium py-1"
                  >
                    <FileSpreadsheet size={14} />
                    Export
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => triggerImportRooms(house.id)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium py-1"
                  >
                    <Upload size={14} />
                    Import
                  </button>
                </div>
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

      {/* Rooms Import Progress Modal */}
      {showImportModal && selectedHouseIdForImport && (
        <RoomsImportModal
          houseId={selectedHouseIdForImport}
          onClose={() => {
            setShowImportModal(false);
            setSelectedHouseIdForImport(null);
          }}
          onSuccess={() => {
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
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toastError('Please enter a name');
      return;
    }

    try {
      setSaving(true);
      const url = house
        ? `${baseUrl}/conference-houses/${house.id}`
        : `${baseUrl}/conference-houses`;
      
      const response = await fetch(url, {
        method: house ? 'PATCH' : 'POST',
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

// Import Errors Modal Component ended up being replaced by RoomsImportModal inline table listing.

// Rooms Import Progress Modal Component
interface RoomsImportModalProps {
  houseId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function RoomsImportModal({ houseId, onClose, onSuccess }: RoomsImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [statusMessage, setProgressMessage] = useState('');
  const [importErrors, setImportErrors] = useState<any[] | null>(null);
  const [importSummary, setImportSummary] = useState<{ imported: number; failed: number } | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGeneralError(null);
    setImportErrors(null);
    setImportSummary(null);
    setProgressPercentage(0);
    
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Max file size limit: 10MB
      if (selectedFile.size > 10 * 1024 * 1024) {
        setGeneralError('File size exceeds the 10MB limit. Please upload a smaller file.');
        setFile(null);
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setGeneralError('Please select a file to import.');
      return;
    }

    try {
      setUploading(true);
      setGeneralError(null);
      setImportErrors(null);
      setImportSummary(null);
      setProgressPercentage(5);
      setProgressMessage('Uploading Spreadsheet File...');

      // Dynamic progress emulation block timer
      let simVal = 5;
      const simTimer = setInterval(() => {
        if (simVal < 90) {
          simVal += Math.floor(Math.random() * 8) + 2;
          setProgressPercentage(Math.min(90, simVal));
        }
      }, 300);

      const response = await excelApi.importRooms(file, houseId, (progressEvent) => {
        const total = progressEvent.total || file.size;
        const uploadProgress = Math.round((progressEvent.loaded * 100) / total);
        // Map upload to 0% - 60%
        const mappedUploadProgress = Math.round((uploadProgress * 60) / 100);
        if (mappedUploadProgress > simVal) {
          simVal = mappedUploadProgress;
          setProgressPercentage(mappedUploadProgress);
        }
        if (uploadProgress >= 100) {
          setProgressMessage('Deducting building & floor configurations in database...');
        }
      });
      
      clearInterval(simTimer);
      setProgressPercentage(100);
      setProgressMessage('Complete!');

      if (response.success) {
        const { imported, failed, errors } = response.data || {};
        setImportSummary({ imported: imported || 0, failed: failed || 0 });
        if (failed > 0) {
          setImportErrors(errors || []);
        } else {
          // Silent success handled - no toast alert shown
        }
      } else {
        setGeneralError(response.message || 'Import failed unexpectedly.');
      }
    } catch (error: any) {
      setGeneralError(error.message || 'Server timeout or exceeded file size limits. Please verify database connectivity.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <h3 className="text-lg font-medium text-gray-900">Import Rooms & Floors Layout</h3>
          {!uploading && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {uploading ? (
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-primary-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <div className="text-sm font-semibold text-gray-700">{progressPercentage}%</div>
            <p className="text-xs text-gray-500 animate-pulse">{statusMessage}</p>
          </div>
        ) : importSummary ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="bg-green-50 border border-green-200 text-green-900 rounded-lg p-3 text-sm mb-4">
              <strong>Import Operation Finished Successfully (Silent Mode):</strong> {importSummary.imported} rooms & structural floors successfully configured.
            </div>

            {importErrors && importErrors.length > 0 && (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm mb-4">
                  <strong>Warning:</strong> {importSummary.failed} record rows failed validation. See table below:
                </div>

                <div className="overflow-auto flex-1 border rounded-lg mb-4">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Row</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Field</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Value</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {importErrors.map((err, idx) => (
                        <tr key={idx} className="hover:bg-red-50 hover:bg-opacity-30">
                          <td className="px-4 py-2 font-medium text-gray-900">{err.row}</td>
                          <td className="px-4 py-2 text-red-600 font-medium">{err.field || 'general'}</td>
                          <td className="px-4 py-2 text-gray-500">{err.value !== null && err.value !== undefined ? String(err.value) : 'N/A'}</td>
                          <td className="px-4 py-2 text-gray-700">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button 
                type="button" 
                onClick={() => {
                  onSuccess();
                  onClose();
                }} 
                className="btn-primary"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {generalError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
                <strong>Upload Error:</strong> {generalError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Rooms Spreadsheet File <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-primary-50 file:text-primary-700
                  hover:file:bg-primary-100"
              />
              {file && (
                <p className="text-xs text-gray-600 mt-1">Selected: {file.name} ({Math.round(file.size / 1024)} KB)</p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Download the template first to ensure your Excel file has the correct format.
                The import operation runs in silent mode and will seamlessly record your space dimensions.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={!file} className="btn-primary">
                Import Layout
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
