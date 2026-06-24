/**
 * Toast Service
 * 
 * WHY: Utility functions for displaying toast notifications
 * Provides consistent API across the application
 */

import toast from 'react-hot-toast';

/**
 * Success toast
 */
export const toastSuccess = (message: string, title?: string) => {
  const displayMessage = title ? `${title}: ${message}` : message;
  return toast.success(displayMessage, {
    duration: 4000,
    position: 'top-right',
  });
};

/**
 * Error toast
 */
export const toastError = (message: string, title?: string) => {
  const displayMessage = title ? `${title}: ${message}` : message;
  return toast.error(displayMessage, {
    duration: 6000,
    position: 'top-right',
  });
};

/**
 * Warning toast
 */
export const toastWarning = (message: string, title?: string) => {
  const displayMessage = title ? `${title}: ${message}` : message;
  return toast(displayMessage, {
    duration: 5000,
    position: 'top-right',
    icon: '⚠️',
  });
};

/**
 * Info toast
 */
export const toastInfo = (message: string, title?: string) => {
  const displayMessage = title ? `${title}: ${message}` : message;
  return toast(displayMessage, {
    duration: 4000,
    position: 'top-right',
    icon: 'ℹ️',
  });
};

/**
 * Loading toast
 * WHY: For async operations, returns toast ID for later updates
 */
export const toastLoading = (message: string) => {
  return toast.loading(message, {
    position: 'top-right',
  });
};

/**
 * Promise toast
 * WHY: Automatically handles loading/success/error states
 */
export const toastPromise = <T,>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string;
    error: string;
  }
) => {
  return toast.promise(
    promise,
    {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    },
    {
      position: 'top-right',
      success: {
        duration: 4000,
      },
      error: {
        duration: 6000,
      },
    }
  );
};

/**
 * Dismiss toast
 */
export const toastDismiss = (toastId: string) => {
  toast.dismiss(toastId);
};

/**
 * Dismiss all toasts
 */
export const toastDismissAll = () => {
  toast.dismiss();
};
