import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[10000] flex flex-col gap-2 pointer-events-none max-w-sm">
      {toasts.map((toast) => {
        const icon =
          toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-good shrink-0" />
          ) : toast.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 text-danger shrink-0" />
          ) : toast.tone === 'warn' ? (
            <AlertTriangle className="w-4 h-4 text-warn shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-accent shrink-0" />
          );

        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface border border-line-strong shadow-xl text-xs font-medium text-ink"
          >
            {icon}
            <span className="leading-snug">{toast.text}</span>
          </div>
        );
      })}
    </div>
  );
};
