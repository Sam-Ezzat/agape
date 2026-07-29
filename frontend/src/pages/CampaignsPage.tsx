/**
 * Campaigns Page
 * 
 * Create and monitor bulk messaging campaigns
 */

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Play, Pause, X, Eye, BarChart3, Users, AlertCircle } from 'lucide-react';
import { communicationApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { MessageCampaign, CampaignStatus, MessageTemplate, CreateCampaignDTO, Message, MessageStatus } from '@/types/communication';

export default function CampaignsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const preselectedAttendeeIds: string[] = (location.state as any)?.attendeeIds || [];

  const [campaigns, setCampaigns] = useState<MessageCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Message detail modal (per-recipient status/errors for a campaign)
  const [viewCampaignId, setViewCampaignId] = useState<string | null>(null);

  // Campaign creation modal
  const [showModal, setShowModal] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [formData, setFormData] = useState<CreateCampaignDTO>({
    name: '',
    description: '',
    templateId: '',
    targetFilter: preselectedAttendeeIds.length > 0 ? { attendeeIds: preselectedAttendeeIds } : {},
    channel: 'WHATSAPP',
  });

  useEffect(() => {
    loadCampaigns();
    loadTemplates();

    // Poll for updates every 5 seconds when campaigns are active
    const interval = setInterval(() => {
      if (campaigns.some(c => c.status === 'IN_PROGRESS')) {
        loadCampaigns();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [filterStatus]);

  // Auto-open the create-campaign modal pre-filled with attendees selected on the Attendees page
  useEffect(() => {
    if (preselectedAttendeeIds.length > 0) {
      setShowModal(true);
      // Clear the router state so a refresh/back doesn't re-trigger this
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const response = await communicationApi.campaigns.list({
        status: filterStatus || undefined,
      });
      setCampaigns(response.data || []);
    } catch (error) {
      toastError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleStartCampaign = async (id: string, status: CampaignStatus) => {
    if (status === 'IN_PROGRESS') {
      toastError('Campaign is already running. Use Pause to stop it.');
      return;
    }
    
    if (!confirm('Start this campaign? Messages will begin sending immediately.')) return;
    
    try {
      await communicationApi.campaigns.start(id);
      toastSuccess('Campaign started successfully.');
      loadCampaigns();
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.response?.data?.error || 'Failed to start campaign';
      toastError(errorMsg);
    }
  };

  const handlePauseCampaign = async (id: string) => {
    try {
      await communicationApi.campaigns.pause(id);
      toastSuccess('Campaign paused');
      loadCampaigns();
    } catch (error) {
      toastError('Failed to pause campaign');
    }
  };

  const handleCancelCampaign = async (id: string) => {
    if (!confirm('Cancel this campaign? This cannot be undone.')) return;
    
    try {
      await communicationApi.campaigns.cancel(id);
      toastSuccess('Campaign cancelled');
      loadCampaigns();
    } catch (error) {
      toastError('Failed to cancel campaign');
    }
  };

  const handleResumeCampaign = async (id: string) => {
    try {
      await communicationApi.campaigns.resume(id);
      toastSuccess('Campaign resumed');
      loadCampaigns();
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.response?.data?.error || 'Failed to resume campaign';
      toastError(errorMsg);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await communicationApi.templates.list({ isActive: true });
      setTemplates(response.data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const previewRecipients = async () => {
    try {
      const response = await communicationApi.campaigns.previewRecipients({
        targetFilter: formData.targetFilter,
      });
      setRecipientCount(response.data?.length || 0);
    } catch (error) {
      toastError('Failed to preview recipients');
      setRecipientCount(null);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.templateId) {
      toastError('Please fill in all required fields');
      return;
    }
    
    try {
      await communicationApi.campaigns.create(formData);
      toastSuccess('Campaign created successfully');
      setShowModal(false);
      resetForm();
      loadCampaigns();
    } catch (error) {
      toastError('Failed to create campaign');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      templateId: '',
      targetFilter: {},
      channel: 'WHATSAPP',
    });
    setRecipientCount(null);
  };

  const handleOpenModal = () => {
    resetForm();
    setShowModal(true);
  };

  const getStatusBadge = (status: CampaignStatus) => {
    const badges: Record<CampaignStatus, { bg: string; text: string; label: string }> = {
      DRAFT: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
      SCHEDULED: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Scheduled' },
      IN_PROGRESS: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'In Progress' },
      PAUSED: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Paused' },
      COMPLETED: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
      CANCELLED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
      FAILED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' },
    };
    const badge = badges[status] || badges.DRAFT;
    return (
      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">Loading campaigns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Redis Warning */}
      {campaigns.some(c => c.status === 'IN_PROGRESS' && c.totalSent === 0) && (
        <div className="card bg-yellow-50 border-yellow-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-yellow-600 text-2xl">⚠️</div>
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-1">Campaign Processing Issue</h3>
              <p className="text-sm text-yellow-800 mb-2">
                You have campaigns marked as "In Progress" but no messages are being sent. This usually means Redis is not running.
              </p>
              <p className="text-xs text-yellow-700 bg-yellow-100 p-2 rounded font-mono">
                To fix: Run <strong>redis-server</strong> in a terminal, then restart your backend server.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-600 mt-1">Create and monitor bulk messaging campaigns</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleOpenModal}>
          <Plus size={20} />
          New Campaign
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input w-64"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PAUSED">Paused</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div className="card text-center py-12">
          <BarChart3 size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No campaigns found</h3>
          <p className="text-gray-600 mb-6">Create your first campaign to start sending messages</p>
          <button className="btn-primary inline-flex items-center gap-2" onClick={handleOpenModal}>
            <Plus size={20} />
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const successRate = campaign.recipientCount > 0
              ? ((campaign.totalSent / campaign.recipientCount) * 100).toFixed(1)
              : '0';
            
            return (
              <div key={campaign.id} className="card hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{campaign.name}</h3>
                    {campaign.description && (
                      <p className="text-sm text-gray-600 mb-2">{campaign.description}</p>
                    )}
                    {getStatusBadge(campaign.status)}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                      <button
                        onClick={() => handleStartCampaign(campaign.id, campaign.status)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded"
                        title="Start Campaign"
                      >
                        <Play size={18} />
                      </button>
                    )}
                    
                    {campaign.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handlePauseCampaign(campaign.id)}
                        className="p-2 text-orange-600 hover:bg-orange-50 rounded"
                        title="Pause Campaign"
                      >
                        <Pause size={18} />
                      </button>
                    )}
                    
                    {campaign.status === 'PAUSED' && (
                      <button
                        onClick={() => handleResumeCampaign(campaign.id)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        title="Resume Campaign"
                      >
                        <Play size={18} />
                      </button>
                    )}
                    
                    {(campaign.status === 'DRAFT' || campaign.status === 'PAUSED') && (
                      <button
                        onClick={() => handleCancelCampaign(campaign.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        title="Cancel Campaign"
                      >
                        <X size={18} />
                      </button>
                    )}
                    
                    <button
                      onClick={() => setViewCampaignId(campaign.id)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                      title="View Details"
                    >
                      <Eye size={18} />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                    <span>Progress</span>
                    <span>{campaign.totalSent} / {campaign.recipientCount} sent</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${successRate}%` }}
                    ></div>
                  </div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{campaign.recipientCount}</p>
                    <p className="text-xs text-gray-600">Recipients</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{campaign.totalSent}</p>
                    <p className="text-xs text-gray-600">Sent</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{campaign.totalFailed}</p>
                    <p className="text-xs text-gray-600">Failed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{campaign.totalPending}</p>
                    <p className="text-xs text-gray-600">Pending</p>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center justify-between text-sm text-gray-500 mt-4 pt-4 border-t">
                  <div>
                    Created {new Date(campaign.createdAt).toLocaleDateString()}
                  </div>
                  {campaign.startedAt && (
                    <div>
                      Started {new Date(campaign.startedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                
                {/* Status Notes */}
                {campaign.status === 'IN_PROGRESS' && campaign.totalSent === 0 && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                    ⚠️ Campaign is running but no messages sent yet. Make sure Redis is running: <code className="bg-yellow-100 px-1 rounded">redis-server</code>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-900">Create New Campaign</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Campaign Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full"
                    placeholder="e.g., Welcome Messages 2026"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input w-full"
                    rows={3}
                    placeholder="Brief description of this campaign"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message Template <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.templateId}
                    onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                    className="input w-full"
                    required
                  >
                    <option value="">Select a template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {template.category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Target Filters */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Target Audience</h3>

                {formData.targetFilter.attendeeIds && formData.targetFilter.attendeeIds.length > 0 ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-900">
                      <span className="font-semibold">{formData.targetFilter.attendeeIds.length}</span> specific attendee(s) selected from the Attendees page will receive this message.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, targetFilter: {} })}
                      className="text-sm text-green-800 underline hover:text-green-900"
                    >
                      Use filters instead
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Gender
                      </label>
                      <select
                        value={formData.targetFilter.gender || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          targetFilter: { ...formData.targetFilter, gender: e.target.value || undefined }
                        })}
                        className="input w-full"
                      >
                        <option value="">All</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Payment Status
                      </label>
                      <select
                        value={formData.targetFilter.paymentStatus || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          targetFilter: { ...formData.targetFilter, paymentStatus: e.target.value || undefined }
                        })}
                        className="input w-full"
                      >
                        <option value="">All</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="unpaid">Unpaid</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Room Assignment
                      </label>
                      <select
                        value={formData.targetFilter.hasRoomAssignment === undefined ? '' : formData.targetFilter.hasRoomAssignment.toString()}
                        onChange={(e) => setFormData({
                          ...formData,
                          targetFilter: {
                            ...formData.targetFilter,
                            hasRoomAssignment: e.target.value === '' ? undefined : e.target.value === 'true'
                          }
                        })}
                        className="input w-full"
                      >
                        <option value="">All</option>
                        <option value="true">Has Assignment</option>
                        <option value="false">No Assignment</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Check-in Status
                      </label>
                      <select
                        value={formData.targetFilter.checkedIn === undefined ? '' : formData.targetFilter.checkedIn.toString()}
                        onChange={(e) => setFormData({
                          ...formData,
                          targetFilter: {
                            ...formData.targetFilter,
                            checkedIn: e.target.value === '' ? undefined : e.target.value === 'true'
                          }
                        })}
                        className="input w-full"
                      >
                        <option value="">All</option>
                        <option value="true">Checked In</option>
                        <option value="false">Not Checked In</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Church
                      </label>
                      <input
                        type="text"
                        value={formData.targetFilter.church || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          targetFilter: { ...formData.targetFilter, church: e.target.value || undefined }
                        })}
                        className="input w-full"
                        placeholder="Filter by church name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Area
                      </label>
                      <input
                        type="text"
                        value={formData.targetFilter.area || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          targetFilter: { ...formData.targetFilter, area: e.target.value || undefined }
                        })}
                        className="input w-full"
                        placeholder="Filter by area"
                      />
                    </div>
                  </div>
                )}

                {/* Preview Recipients */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={previewRecipients}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Users size={18} />
                    Preview Recipients
                  </button>
                  {recipientCount !== null && (
                    <p className="mt-2 text-sm text-gray-600">
                      <span className="font-semibold">{recipientCount}</span> recipient(s) will receive this message
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 border-t pt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Campaign Message Details Modal */}
      {viewCampaignId && (
        <CampaignMessagesModal
          campaignId={viewCampaignId}
          onClose={() => setViewCampaignId(null)}
        />
      )}
    </div>
  );
}

interface CampaignMessagesModalProps {
  campaignId: string;
  onClose: () => void;
}

function CampaignMessagesModal({ campaignId, onClose }: CampaignMessagesModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<MessageStatus | ''>('FAILED');

  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, statusFilter]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await communicationApi.campaigns.getMessages(campaignId, {
        status: statusFilter || undefined,
        limit: 100,
      });
      setMessages(response.data || []);
      setTotal(response.total ?? (response.data || []).length);
    } catch (error) {
      toastError('Failed to load message details');
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (status: MessageStatus) => {
    const badges: Record<MessageStatus, { bg: string; text: string }> = {
      PENDING: { bg: 'bg-gray-100', text: 'text-gray-800' },
      QUEUED: { bg: 'bg-blue-100', text: 'text-blue-800' },
      SENDING: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      SENT: { bg: 'bg-green-100', text: 'text-green-800' },
      DELIVERED: { bg: 'bg-green-100', text: 'text-green-800' },
      READ: { bg: 'bg-green-100', text: 'text-green-800' },
      FAILED: { bg: 'bg-red-100', text: 'text-red-800' },
    };
    const badge = badges[status] || badges.PENDING;
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Message Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="px-6 pt-4 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Filter:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MessageStatus | '')}
            className="input w-48"
          >
            <option value="">All</option>
            <option value="FAILED">Failed</option>
            <option value="SENT">Sent</option>
            <option value="PENDING">Pending</option>
            <option value="QUEUED">Queued</option>
          </select>
          {!loading && <span className="text-sm text-gray-500">{total} message(s)</span>}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No {statusFilter ? statusFilter.toLowerCase() : ''} messages found
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((message) => (
                <div key={message.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {message.attendee?.fullName || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-600">{message.recipient}</p>
                    </div>
                    {statusBadge(message.status)}
                  </div>
                  {message.status === 'FAILED' && message.errorMessage && (
                    <div className="mt-2 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
                      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{message.errorMessage}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
