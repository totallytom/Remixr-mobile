import React, { createContext, useContext, useState, useCallback } from 'react';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertItem {
  id: string;
  type: AlertType;
  title?: string;
  message: string;
  /** Auto-dismiss after ms (default 4000, 0 = never) */
  duration?: number;
}

interface AlertContextValue {
  alerts: AlertItem[];
  addAlert: (alert: Omit<AlertItem, 'id'>) => string;
  removeAlert: (id: string) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const addAlert = useCallback((alert: Omit<AlertItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    const duration = alert.duration ?? 4000;
    setAlerts(prev => [...prev, { ...alert, id }]);
    if (duration > 0) {
      setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), duration);
    }
    return id;
  }, []);

  const removeAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  return (
    <AlertContext.Provider value={{ alerts, addAlert, removeAlert }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlerts = () => {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlerts must be used inside AlertProvider');
  return ctx;
};
