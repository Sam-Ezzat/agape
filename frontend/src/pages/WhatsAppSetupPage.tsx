/**
 * WhatsApp Setup Page
 * 
 * Initialize and manage WhatsApp Web connection
 */

import { useEffect, useState } from 'react';
import { MessageCircle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { communicationApi } from '@/services/api.service';
import { toastSuccess, toastError } from '@/services/toast.service';
import type { WhatsAppStatus } from '@/types/communication';
import QRCode from 'react-qr-code';

export default function WhatsAppSetupPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    // Poll faster while a connection/loading is in progress, slower once settled
    const isBusy = initializing || status?.isInitializing || (status?.loadingPercent !== undefined && !status?.isReady);
    const interval = setInterval(loadStatus, isBusy ? 1000 : 3000);
    return () => clearInterval(interval);
  }, [initializing, status?.isInitializing, status?.loadingPercent, status?.isReady]);

  const loadStatus = async () => {
    try {
      const response = await communicationApi.whatsapp.getStatus();
      setStatus(response.data);
      setLoading(false);
      setInitializing(response.data.isInitializing);
    } catch (error) {
      // Silent fail for polling
      setLoading(false);
    }
  };

  const handleInitialize = async () => {
    try {
      setInitializing(true);
      await communicationApi.whatsapp.initialize();
      toastSuccess('WhatsApp initialization started.');

      // The initialize request only kicks off the process — actual QR/loading
      // progress arrives via status polling, not this response.
      loadStatus();
    } catch (error) {
      toastError('Failed to initialize WhatsApp');
      setInitializing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect WhatsApp? You will need to scan QR code again.')) return;
    
    try {
      await communicationApi.whatsapp.disconnect();
      toastSuccess('WhatsApp disconnected');
      loadStatus();
    } catch (error) {
      toastError('Failed to disconnect WhatsApp');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">Loading WhatsApp status...</p>
        </div>
      </div>
    );
  }

  const isConnected = status?.isReady && status?.sessionActive;
  const hasQR = status?.qrCode;
  const isLoadingSession = !isConnected && status?.isInitializing;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <MessageCircle size={32} className="text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">WhatsApp Setup</h1>
        <p className="text-gray-600 mt-2">Connect your WhatsApp account to send bulk messages</p>
      </div>

      {/* Status Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Connection Status</h2>
          <button
            onClick={loadStatus}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded"
            title="Refresh"
          >
            <RefreshCw size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              {isConnected ? (
                <CheckCircle className="text-green-500" size={24} />
              ) : (
                <XCircle className="text-red-500" size={24} />
              )}
              <div>
                <p className="font-medium text-gray-900">
                  {isConnected ? 'Connected' : 'Not Connected'}
                </p>
                <p className="text-sm text-gray-600">
                  {isConnected
                    ? 'WhatsApp is ready to send messages'
                    : hasQR
                    ? 'Scan QR code below to connect'
                    : status?.initializationError
                    ? status.initializationError
                    : isLoadingSession
                    ? `${status?.loadingMessage || 'Loading WhatsApp'}...`
                    : initializing
                    ? 'Starting connection...'
                    : 'Click Initialize to start connection'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isConnected && !hasQR && !initializing && !isLoadingSession && (
                <button
                  onClick={handleInitialize}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <MessageCircle size={18} />
                  {status?.sessionActive === false ? 'Reconnect' : 'Initialize'}
                </button>
              )}
              {isConnected && (
                <button
                  onClick={handleDisconnect}
                  className="btn-secondary text-red-600 hover:bg-red-50"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {status?.initializationError && !isConnected && (
            <div className="p-4 border border-red-200 bg-red-50 text-sm text-red-700 rounded-lg">
              {status.initializationError}. Check the backend connection and try Initialize again.
            </div>
          )}

          {/* Rate Limits */}
          {status?.rateLimit && isConnected && (
            <div className="space-y-3">
              {status.rateLimit.warmup && status.rateLimit.warmup.stage !== 'established' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  🌱 Warming up ({status.rateLimit.warmup.stage.replace('day', 'Day ')}) — sending at{' '}
                  {Math.round(status.rateLimit.warmup.limitMultiplier * 100)}% capacity with longer delays
                  between messages, to protect this number from being flagged. Ramps up to full capacity
                  over the first week.
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Messages Today</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {status.rateLimit.dailyCount} / {status.rateLimit.dailyLimit}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {status.rateLimit.dailyRemaining} remaining
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Messages This Hour</p>
                  <p className="text-2xl font-bold text-green-600">
                    {status.rateLimit.hourlyCount} / {status.rateLimit.hourlyLimit}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {status.rateLimit.hourlyRemaining} remaining
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Section */}
      {!isConnected && (
        <div className="card text-center">
          <h2 className="text-xl font-semibold mb-4">Connect WhatsApp</h2>
          
          {!hasQR && !initializing && !isLoadingSession && (
            <div>
              <p className="text-gray-600 mb-6">
                Click the button below to generate a QR code, then scan it with WhatsApp on your phone
              </p>
              <button
                onClick={handleInitialize}
                className="btn-primary inline-flex items-center gap-2"
              >
                <MessageCircle size={20} />
                Initialize WhatsApp
              </button>
            </div>
          )}

          {initializing && !isLoadingSession && (
            <div className="py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
              <p className="text-gray-600">Starting connection...</p>
            </div>
          )}

          {!hasQR && isLoadingSession && (
            <div className="py-12 max-w-md mx-auto">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
              <p className="text-gray-600">{status?.loadingMessage || 'Loading WhatsApp'}&hellip;</p>
            </div>
          )}

          {hasQR && !isConnected && (
            <div>
              <div className="inline-block p-6 bg-white border-4 border-gray-200 rounded-lg mb-6">
                <QRCode value={status.qrCode || ''} size={256} />
              </div>
              <div className="max-w-md mx-auto text-left">
                <h3 className="font-semibold text-gray-900 mb-3">How to scan:</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                  <li>Open WhatsApp on your phone</li>
                  <li>Tap Menu (⋮) or Settings and select "Linked Devices"</li>
                  <li>Tap "Link a Device"</li>
                  <li>Point your phone at this screen to scan the QR code</li>
                </ol>
              </div>
              <p className="text-xs text-gray-500 mt-6">
                QR code refreshes automatically. Keep this page open until connected.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="card bg-blue-50 border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-3">Important Notes:</h3>
        <ul className="list-disc list-inside space-y-2 text-sm text-blue-800">
          <li>Keep WhatsApp open on your phone for best performance</li>
          <li>Rate limits: Maximum 50 messages per hour, 200 per day</li>
          <li>Messages are sent with 3-8 second delays to avoid detection</li>
          <li>Connection will persist as long as the server is running</li>
        </ul>
      </div>
    </div>
  );
}
