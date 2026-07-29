/**
 * Message Templates Page
 * 
 * Manage WhatsApp message templates with variable substitution
 */

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, FileText } from 'lucide-react';
import { communicationApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { MessageTemplate, TemplateCategory } from '@/types/communication';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('');

  useEffect(() => {
    loadTemplates();
  }, [filterCategory]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await communicationApi.templates.list({
        category: filterCategory || undefined,
      });
      setTemplates(response.data || []);
    } catch (error) {
      toastError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await communicationApi.templates.delete(id);
      toastSuccess('Template deleted successfully');
      loadTemplates();
    } catch (error) {
      toastError('Failed to delete template');
    }
  };

  const getCategoryBadgeColor = (category: TemplateCategory): string => {
    const colors: Record<TemplateCategory, string> = {
      ROOM_ASSIGNMENT: 'bg-blue-100 text-blue-800',
      CHECK_IN: 'bg-green-100 text-green-800',
      PAYMENT: 'bg-yellow-100 text-yellow-800',
      WELCOME: 'bg-purple-100 text-purple-800',
      REMINDER: 'bg-orange-100 text-orange-800',
      ANNOUNCEMENT: 'bg-pink-100 text-pink-800',
      FOLLOW_UP: 'bg-indigo-100 text-indigo-800',
      OTHER: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || colors.OTHER;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Message Templates</h1>
          <p className="text-gray-600 mt-1">Create and manage reusable message templates</p>
        </div>
        <button
          onClick={() => {
            setEditingTemplate(null);
            setShowModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          New Template
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter by Category:</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="input w-64"
          >
            <option value="">All Categories</option>
            <option value="ROOM_ASSIGNMENT">Room Assignment</option>
            <option value="CHECK_IN">Check-in</option>
            <option value="PAYMENT">Payment</option>
            <option value="WELCOME">Welcome</option>
            <option value="REMINDER">Reminder</option>
            <option value="ANNOUNCEMENT">Announcement</option>
            <option value="FOLLOW_UP">Follow-up</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="card text-center py-12">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No templates found</h3>
          <p className="text-gray-600 mb-6">Create your first message template to get started</p>
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={20} />
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map((template) => (
            <div key={template.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{template.name}</h3>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getCategoryBadgeColor(template.category)}`}>
                    {template.category.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingTemplate(template);
                      setShowModal(true);
                    }}
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                    title="Edit"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {template.description && (
                <p className="text-sm text-gray-600 mb-4">{template.description}</p>
              )}

              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <p className="text-sm text-gray-700 line-clamp-3 whitespace-pre-wrap" dir="auto">
                  {template.body}
                </p>
              </div>

              {template.variables.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-700 mb-2">Variables:</p>
                  <div className="flex flex-wrap gap-2">
                    {template.variables.map((variable, idx) => (
                      <span
                        key={idx}
                        className="inline-block px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-mono"
                      >
                        {`{{${variable}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t">
                <div>
                  <span className="font-medium">{template.usageCount}</span> times used
                </div>
                <div className={`flex items-center gap-2 ${template.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${template.isActive ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  {template.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template Modal - TODO: Create separate component */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4">
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h2>
              <p className="text-gray-600 mb-6">
                Use <code className="bg-gray-100 px-2 py-1 rounded text-sm">{`{{variableName}}`}</code> for dynamic values
              </p>
              
              {/* TODO: Add form */}
              <div className="text-center text-gray-500 py-8">
                Template form coming soon...
                <br />
                Variables: fullName, phone, email, roomNumber, buildingName, etc.
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button className="btn-primary flex-1">
                  {editingTemplate ? 'Update' : 'Create'} Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
