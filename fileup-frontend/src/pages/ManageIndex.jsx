import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';

export default function ManageIndex() {
  const [key, setKey] = useState('');
  const navigate = useNavigate();
  const addToast = useToast();

  const handleUnlock = (e) => {
    e.preventDefault();
    if (!key.trim()) {
      addToast('Please enter a valid Management Key.', 'error');
      return;
    }
    navigate(`/manage/${key.trim()}`);
  };

  return (
    <div className="flex-1 flex items-center justify-center w-full max-w-lg mx-auto">
      <div className="relative w-full">
        {/* Glow effects */}
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-64 h-64 bg-tertiary/5 rounded-full blur-[80px] pointer-events-none"></div>

        <div className="relative bg-surface-container-lowest p-10 md:p-14 rounded-[2.5rem] shadow-2xl glass-panel text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-inner">
            <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'wght' 300" }}>
              admin_panel_settings
            </span>
          </div>

          <h1 className="text-3xl font-headline font-extrabold text-on-surface mb-4">
            Access Control
          </h1>
          <p className="text-on-surface-variant font-medium mb-10 text-sm leading-relaxed">
            Enter the ethereal management key provided during upload to refine settings or sever the conduit.
          </p>

          <form onSubmit={handleUnlock} className="space-y-6">
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">
                key
              </span>
              <input 
                type="text" 
                placeholder="Paste your 64-char active key..." 
                value={key}
                onChange={e => setKey(e.target.value)}
                className="w-full bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/50 py-5 pl-12 pr-4 text-sm font-medium rounded-2xl shadow-sm transition-shadow"
                required
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-4 bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-xl font-headline font-bold text-lg hover:scale-[1.02] shadow-[0_10px_15px_-3px_rgba(53,37,205,0.15)] transition-all flex items-center justify-center gap-2"
            >
              Unlock Terminal 
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
