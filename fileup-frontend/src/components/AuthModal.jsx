import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from './ToastContext';

export default function AuthModal({ onClose, setUserProfile }) {
  const [hasToken, setHasToken] = useState(!!localStorage.getItem('jwt_token'));
  const addToast = useToast();

  useEffect(() => {
    if (hasToken) {
      setUserProfile({ loggedIn: true });
    }
  }, [hasToken, setUserProfile]);



  const handleConnectDrive = async () => {
    try {
      const res = await api.getGoogleOAuthUrl();
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err) {
      addToast('Failed to get Google OAuth link', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    setHasToken(false);
    setUserProfile(null);
    addToast('Disconnected successfully.', 'success');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      
      {/* Container - Side by side layout */}
      <div className="bg-surface-bright max-w-[900px] w-full rounded-[2rem] overflow-hidden shadow-2xl relative flex flex-col md:flex-row min-h-[600px]">
        
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors z-20">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>

        {/* Left Side: Marketing / Info */}
        <div className="w-full md:w-1/2 p-12 flex flex-col justify-center relative">
          {/* Subtle gradient blob background for left side */}
          <div className="absolute top-0 right-[-20%] w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary-container px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase w-max mb-6">
            <span className="material-symbols-outlined text-[14px]">workspace_premium</span>
            Premium Feature
          </div>

          <h2 className="text-4xl lg:text-5xl font-headline font-bold text-on-surface leading-tight mb-4 tracking-tight">
            Save to Your <br/>
            <span className="text-primary-container leading-tight">Google Drive</span>
          </h2>

          <p className="text-on-surface-variant font-medium leading-relaxed mb-10 w-11/12">
            Bridge the gap between physical uploads and cloud permanence. Connect your Drive for a seamless ethereal conduit experience.
          </p>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 mt-1 p-1 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-sm text-primary" style={{fontVariationSettings: "'wght' 700"}}>check</span>
              </div>
              <div>
                <h4 className="font-bold text-sm text-on-surface">Unlimited storage</h4>
                <p className="text-xs text-on-surface-variant">Leverage your existing workspace capacity.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-primary/10 mt-1 p-1 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-sm text-primary" style={{fontVariationSettings: "'wght' 700"}}>check</span>
              </div>
              <div>
                <h4 className="font-bold text-sm text-on-surface">No expiry</h4>
                <p className="text-xs text-on-surface-variant">Files stay as long as you need them.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-primary/10 mt-1 p-1 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-sm text-primary" style={{fontVariationSettings: "'wght' 700"}}>check</span>
              </div>
              <div>
                <h4 className="font-bold text-sm text-on-surface">Full privacy</h4>
                <p className="text-xs text-on-surface-variant">Direct transfer with end-to-end encryption.</p>
              </div>
            </div>
          </div>

          {/* Social Proof Box */}
          <div className="mt-10 bg-surface-container-low p-4 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 bg-on-surface rounded-xl flex items-center justify-center shadow-lg">
               <span className="material-symbols-outlined text-primary text-2xl">cloud</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface">Used by 2k+ Power Users</p>
              <div className="flex -space-x-2 mt-1">
                <div className="w-5 h-5 rounded-full bg-slate-300 border-2 border-surface-container-low"></div>
                <div className="w-5 h-5 rounded-full bg-slate-400 border-2 border-surface-container-low"></div>
                <div className="w-5 h-5 rounded-full bg-slate-500 border-2 border-surface-container-low"></div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: Auth Box */}
        <div className="w-full md:w-1/2 flex items-center p-6 lg:p-12">
          <div className="bg-white w-full h-full rounded-[1.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.08)] p-8 lg:p-10 flex flex-col justify-center">
            
            {hasToken ? (
              <div className="flex flex-col items-center py-10 animate-in fade-in zoom-in-95">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-4xl text-primary">account_circle</span>
                </div>
                <h3 className="font-headline font-bold text-2xl mb-2 text-on-surface">Portal Connected</h3>
                <p className="text-sm text-center text-on-surface-variant mb-10 w-4/5 leading-relaxed">
                  Your identity is secured and your Google Drive is actively linked as the Ethereal Conduit.
                </p>

                <button onClick={handleLogout} className="text-xs font-bold text-outline hover:text-error transition-colors uppercase tracking-widest mt-4">
                  Log Out
                </button>
              </div>
            ) : (
              <div className="animate-in fade-in zoom-in-95 flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-4xl text-slate-400">shield_lock</span>
                </div>
                
                <h3 className="text-2xl font-headline font-bold text-center text-on-surface mb-2">
                  Portal Authentication
                </h3>
                
                <p className="text-sm text-center text-on-surface-variant mb-10 w-4/5 leading-relaxed">
                  Connect your identity simply and securely using Sign-in with Google. No additional passwords required.
                </p>

                {/* Google Button */}
                <button 
                  type="button"
                  onClick={handleConnectDrive}
                  className="w-full flex items-center justify-center gap-3 py-4 px-4 bg-white text-slate-700 border-2 border-slate-200 rounded-xl font-headline font-bold hover:bg-slate-50 hover:border-slate-300 transition-all mb-4"
                >
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-5 h-5" alt="G" />
                  Continue with Google
                </button>

                <p className="text-center text-xs text-slate-400 mt-6 max-w-xs px-4">
                  By continuing, you link your Google Drive enabling the Ethereal Backup service.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
