import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto remove after 3s
    setTimeout(() => {
      setToasts((prev) => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="fixed top-24 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className={`
              pointer-events-auto flex items-center justify-between min-w-[250px] px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md border 
              transform transition-all animate-in slide-in-from-right-8 duration-300
              ${toast.type === 'error' ? 'bg-red-50/90 border-red-200 text-red-800' : 'bg-emerald-50/90 border-emerald-200 text-emerald-800'}
            `}
          >
            <div className="flex items-center gap-3 font-medium text-sm">
              <span className={`material-symbols-outlined ${toast.type === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>
                 {toast.type === 'error' ? 'error' : 'check_circle'}
              </span>
              {toast.message}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
