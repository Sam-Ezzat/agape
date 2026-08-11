/**
 * TemplateFormModal Component
 *
 * WHY: Create/edit form for message templates, used by TemplatesPage.
 * Handles both create (no initialTemplate) and edit (initialTemplate set) modes.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { communicationApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { CreateTemplateDTO, MessageTemplate, TemplateCategory } from '@/types/communication';

interface TemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  template: MessageTemplate | null; // null = create mode
}

const CATEGORY_OPTIONS: { value: TemplateCategory; label: string }[] = [
  { value: 'GENERAL', label: 'General' },
  { value: 'ROOM_ASSIGNMENT', label: 'Room Assignment' },
  { value: 'CHECK_IN', label: 'Check-in' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'WELCOME', label: 'Welcome' },
  { value: 'SCHEDULE', label: 'Schedule' },
  { value: 'TRANSPORTATION', label: 'Transportation' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

const COMMON_VARIABLES = [
  'fullName', 'phone', 'ticketId', 'roomNumber', 'buildingName', 'floorName', 'conferenceRole', 'conferenceName',
];

const emptyForm: CreateTemplateDTO = {
  name: '',
  description: '',
  category: 'GENERAL',
  subject: '',
  body: '',
  language: 'ar',
  hasAttachment: false,
  attachmentUrl: '',
  attachmentType: '',
};

export default function TemplateFormModal({ isOpen, onClose, onSaved, template }: TemplateFormModalProps) {
  const [form, setForm] = useState<CreateTemplateDTO>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name,
        description: template.description || '',
        category: template.category,
        subject: template.subject || '',
        body: template.body,
        language: template.language || 'ar',
        hasAttachment: template.hasAttachment,
        attachmentUrl: template.attachmentUrl || '',
        attachmentType: template.attachmentType || '',
      });
      setIsActive(template.isActive);
    } else {
      setForm(emptyForm);
      setIsActive(true);
    }
  }, [template, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toastError('Template name is required');
      return;
    }
    if (!form.body.trim()) {
      toastError('Template body is required');
      return;
    }

    setSaving(true);
    try {
      if (template) {
        const response = await communicationApi.templates.update(template.id, { ...form, isActive });
        if (!response.success) throw new Error(response.message);
        toastSuccess('Template updated successfully');
      } else {
        const response = await communicationApi.templates.create(form);
        if (!response.success) throw new Error(response.message);
        toastSuccess('Template created successfully');
      }
      onSaved();
      onClose();
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : `Failed to ${template ? 'update' : 'create'} template`
      );
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (variable: string) => {
    setForm((prev) => ({ ...prev, body: `${prev.body}{{${variable}}}` }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">{template ? 'Edit Template' : 'New Template'}</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>

          <p className="text-gray-600 mb-6">
            Use <code className="bg-gray-100 px-2 py-1 rounded text-sm">{`{{variableName}}`}</code> for dynamic values
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input w-full"
                placeholder="e.g. Room Assignment Notice"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as TemplateCategory })}
                  className="input w-full"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="input w-full"
                >
                  <option value="ar">Arabic</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input w-full"
                placeholder="Optional short description for your own reference"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Message Body *</label>
                <div className="flex flex-wrap gap-1">
                  {COMMON_VARIABLES.map((variable) => (
                    <button
                      key={variable}
                      type="button"
                      onClick={() => insertVariable(variable)}
                      className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-mono hover:bg-blue-100"
                    >
                      {`{{${variable}}}`}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="input w-full font-mono text-sm"
                rows={6}
                dir="auto"
                placeholder="مرحباً {{fullName}}، تم تخصيص الغرفة {{roomNumber}} لك..."
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.hasAttachment}
                  onChange={(e) => setForm({ ...form, hasAttachment: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700">Has attachment</span>
              </label>
              {form.hasAttachment && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <input
                    type="text"
                    value={form.attachmentUrl}
                    onChange={(e) => setForm({ ...form, attachmentUrl: e.target.value })}
                    className="input w-full"
                    placeholder="Attachment URL"
                  />
                  <input
                    type="text"
                    value={form.attachmentType}
                    onChange={(e) => setForm({ ...form, attachmentType: e.target.value })}
                    className="input w-full"
                    placeholder="e.g. image/jpeg, application/pdf"
                  />
                </div>
              )}
            </div>

            {template && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
