/**
 * SendWhatsAppModal Component
 *
 * WHY: Manual, per-attendee WhatsApp send — no automation, no ban risk.
 * Admin picks a template, reviews the rendered text (real attendee data
 * substituted in via the existing template preview endpoint), then copies
 * it and is redirected to wa.me to send it themselves from their own
 * WhatsApp. The send is logged as a Message row so it shows up alongside
 * campaign sends in tracking.
 */

import { useEffect, useState } from 'react';
import { X, Copy } from 'lucide-react';
import { communicationApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import { normalizePhoneToE164 } from '@/utils/phone';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import type { Attendee } from '@/types/api';
import type { MessageTemplate } from '@/types/communication';

interface SendWhatsAppModalProps {
  attendee: Attendee | null; // null = closed
  onClose: () => void;
}

export default function SendWhatsAppModal({ attendee, onClose }: SendWhatsAppModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [text, setText] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!attendee) return;

    setTemplateId('');
    setText('');

    communicationApi.templates.list({ isActive: true }).then((response) => {
      setTemplates(response.data || []);
    }).catch(() => {
      toastError('Failed to load templates');
    });
  }, [attendee]);

  useEffect(() => {
    if (!attendee || !templateId) return;

    setLoadingPreview(true);
    communicationApi.templates
      .preview(templateId, { attendeeId: attendee.id })
      .then((response) => {
        if (response.success && response.data) {
          setText(response.data.preview);
        } else {
          toastError(response.message || 'Failed to render template');
        }
      })
      .catch(() => toastError('Failed to render template'))
      .finally(() => setLoadingPreview(false));
  }, [attendee, templateId]);

  if (!attendee) return null;

  const phoneE164 = attendee.phone ? normalizePhoneToE164(attendee.phone) : null;

  const handleSend = async () => {
    if (!templateId) {
      toastError('Select a template first');
      return;
    }
    if (!phoneE164) {
      toastError('This attendee has no valid phone number');
      return;
    }
    if (!text.trim()) {
      toastError('Message is empty');
      return;
    }

    setSending(true);
    try {
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        // Clipboard access can fail (permissions/non-HTTPS) — handled below.
      }

      // WHY: deliberately NOT passing ?text= here. WhatsApp's own decoding of
      // that URL parameter corrupts certain emoji (confirmed — the same text
      // renders correctly in this textarea, and only breaks once WhatsApp
      // opens with it prefilled). That's WhatsApp's client-side behavior, not
      // something under our control, so instead we rely purely on the
      // clipboard copy above (verified correct, same source as the preview)
      // and have the admin paste it in manually.
      const digits = phoneE164.replace('+', '');
      const url = `https://wa.me/${digits}`;
      window.open(url, '_blank', 'noopener,noreferrer');

      const logResponse = await communicationApi.messages.logManual({
        attendeeId: attendee.id,
        templateId,
        body: text,
      });
      if (!logResponse.success) {
        throw new Error(logResponse.message);
      }

      toastSuccess(copied ? 'Message copied — paste it in the chat that just opened' : 'WhatsApp opened — copy the message above and paste it in');
      onClose();
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Failed to log message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <WhatsAppIcon className="text-green-600" size={22} />
              <h2 className="text-xl font-bold text-gray-900">Send WhatsApp to {attendee.fullName}</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={22} />
            </button>
          </div>

          {!phoneE164 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              This attendee has no valid phone number on file — WhatsApp can't be opened for them.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="input w-full"
              >
                <option value="">Select a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {templateId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message {loadingPreview && <span className="text-gray-400">(rendering...)</span>}
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="input w-full font-mono text-sm"
                  rows={8}
                  dir="auto"
                  disabled={loadingPreview}
                />
                <p className="text-xs text-gray-500 mt-1">
                  You can edit this before sending. It'll be copied to your clipboard — paste it (Ctrl+V) into the WhatsApp chat that opens.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={sending}>
              Cancel
            </button>
            <button
              onClick={handleSend}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
              disabled={sending || !templateId || !phoneE164 || loadingPreview}
            >
              <Copy size={16} />
              {sending ? 'Opening...' : 'Copy & Open WhatsApp'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
