import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/ToastContext';

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // Settings
  const [expiresAt, setExpiresAt] = useState('');
  const [maxViews, setMaxViews] = useState(10);
  const [storageConfig, setStorageConfig] = useState('r2'); // 'r2' | 'google_drive'
  const isGoogleConnected = !!localStorage.getItem('jwt_token');

  const fileInputRef = useRef(null);
  const addToast = useToast();

  useEffect(() => {
    // Set default expiry to +2 days
    const d = new Date();
    d.setDate(d.getDate() + 2);
    setExpiresAt(d.toISOString().slice(0, 16));
  }, []);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const onUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    
    // Convert local datetime-local string to true ISO string
    let exact_expires_at = null;
    if (expiresAt) {
      exact_expires_at = new Date(expiresAt).toISOString();
    }

    try {
      const result = await api.uploadFile(file, {
        max_views: maxViews,
        exact_expires_at,
        storageConfig
      }, (percent) => {
        setUploadProgress(percent);
      });
      setUploadResult(result);
      addToast('File successfully secured in the conduit!', 'success');
    } catch (err) {
      addToast(err.error || "Upload failed", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    addToast('Copied to clipboard!', 'success');
  };

  return (
    <div className="w-full h-full flex flex-col items-center">
      {/* Decorative Background Glow */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[60%] bg-primary/5 rounded-full blur-[120px] -z-10"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[60%] bg-secondary-container/10 rounded-full blur-[120px] -z-10"></div>

      {/* Hero Section */}
      <section className="max-w-4xl text-center px-6 mb-16">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-gradient leading-tight font-headline">
          Secure File Sharing. <br/>Your Rules, Your Storage.
        </h1>
        <p className="text-on-surface-variant text-lg md:text-xl max-w-2xl mx-auto font-body leading-relaxed">
          The weightless conduit between local storage and digital light. Minimal, private, and exceptionally fast.
        </p>
      </section>

      {/* Primary Upload Canvas */}
      <section className="w-full max-w-3xl px-6 relative">
        <div className="glass-panel rounded-3xl p-10 shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500">
          
          {/* Dropzone */}
          <div 
            className={`group relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl py-24 cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${dragActive ? 'border-primary-container bg-primary/10' : 'border-outline-variant/30 hover:border-primary-container/40 hover:bg-primary/5'}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={onUploadClick}
          >
            <input 
              ref={fileInputRef} 
              type="file" 
              className="hidden" 
              onChange={handleChange} 
            />
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform">
              <span className="material-symbols-outlined text-primary text-3xl">upload_file</span>
            </div>
            <p className="text-on-surface font-semibold text-lg mb-1">
              {file ? file.name : "Drop file here or click to browse"}
            </p>
            <p className="text-on-surface-variant text-sm">Supports any file type up to 2GB</p>
            <div className="absolute inset-0 bg-secondary-container/5 opacity-0 group-hover:opacity-100 transition-opacity blur-2xl -z-10 rounded-2xl"></div>
          </div>

          {/* Upload Button */}
          {file && !uploadResult && (
             <div className="mt-6 flex justify-center">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                  disabled={isUploading}
                  className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-transform disabled:opacity-50"
                >
                  {isUploading ? `Uploading ${Math.round(uploadProgress)}%` : 'Start Upload'}
                </button>
             </div>
          )}

          {/* Advanced Settings Section (Always Show) */}
          {!uploadResult && (
            <div className="mt-8 bg-surface/50 border border-surface-container-low p-6 rounded-3xl">
                <div className="flex items-center gap-2 font-medium text-on-surface mb-6">
                  <span className="material-symbols-outlined text-lg">settings</span>
                  Advanced Sharing Rules
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Expiry Picker */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-outline">Expiry Timer</label>
                    <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-xl">
                      <input 
                        className="w-full bg-transparent border-none focus:ring-0 text-sm py-2 px-3 text-on-surface-variant" 
                        type="datetime-local" 
                        value={expiresAt}
                        onChange={e => setExpiresAt(e.target.value)}
                      />
                      <span className="material-symbols-outlined text-outline pr-3">event</span>
                    </div>
                  </div>

                  {/* Max Views */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-outline">Max Views</label>
                    <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-xl">
                      <input 
                        className="w-full bg-transparent border-none focus:ring-0 text-sm py-2 px-3 text-on-surface-variant" 
                        min="1" 
                        type="number" 
                        value={maxViews}
                        onChange={e => setMaxViews(e.target.value)}
                      />
                      <span className="material-symbols-outlined text-outline pr-3">visibility</span>
                    </div>
                  </div>

                  {/* Storage Toggle */}
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-outline">Storage Destination</label>
                    <div className="flex p-1 bg-surface-container-low rounded-xl gap-1">
                      <button 
                        onClick={() => setStorageConfig('r2')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-all ${
                          storageConfig === 'r2' 
                          ? 'bg-surface-container-lowest shadow-sm text-primary font-semibold' 
                          : 'text-on-surface-variant font-medium hover:bg-surface-container-high'
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg">cloud_off</span>
                        Anonymous (R2)
                      </button>
                      <button 
                        onClick={() => {
                          if (!isGoogleConnected) {
                            addToast('You must Login / Register and connect Google Drive first!', 'error');
                            return;
                          }
                          setStorageConfig('google_drive');
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-all ${
                          storageConfig === 'google_drive' 
                          ? 'bg-surface-container-lowest shadow-sm text-primary font-semibold' 
                          : 'text-on-surface-variant font-medium hover:bg-surface-container-high'
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg">add_to_drive</span>
                        Google Drive
                      </button>
                    </div>
                  </div>

                </div>
            </div>
          )}
        </div>

        {/* Bento Mini Features */}
        {!uploadResult && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col gap-3 group hover:bg-surface-container-lowest transition-all">
              <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>shield_lock</span>
              <h3 className="font-bold text-on-surface">End-to-End</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">Your files are encrypted in-transit based on strict protocols.</p>
            </div>
            <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col gap-3 group hover:bg-surface-container-lowest transition-all">
              <span className="material-symbols-outlined text-tertiary" style={{fontVariationSettings: "'FILL' 1"}}>timer</span>
              <h3 className="font-bold text-on-surface">Auto-Destruct</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">Files vanish into light based on your specific view limits.</p>
            </div>
            <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col gap-3 group hover:bg-surface-container-lowest transition-all">
              <span className="material-symbols-outlined text-secondary" style={{fontVariationSettings: "'FILL' 1"}}>hub</span>
              <h3 className="font-bold text-on-surface">Cloud Bridges</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">Directly conduit files into your personal Google Drive.</p>
            </div>
          </div>
        )}
      </section>

      {/* Upload Success Modal */}
      {uploadResult && (
        <div className="fixed inset-0 bg-white/40 dark:bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100]">
            <div className="glass-panel p-10 rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                        <span className="material-symbols-outlined text-green-600 text-3xl">check_circle</span>
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Transfer Complete</h2>
                    <p className="text-on-surface-variant text-sm mb-8">Your file is live and secured.</p>
                    
                    <div className="w-full bg-surface-container p-3 rounded-xl flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-indigo-600 truncate">{uploadResult.url}</span>
                        <button onClick={() => copyToClipboard(uploadResult.url)} className="bg-primary text-white p-2 rounded-lg hover:bg-primary-container transition-all">
                            <span className="material-symbols-outlined text-sm">content_copy</span>
                        </button>
                    </div>

                    <div className="w-full bg-surface-container p-3 rounded-xl flex flex-col items-start mb-6">
                        <span className="text-xs font-bold text-error uppercase mb-1">Management Key (Secret)</span>
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-mono text-error truncate">{uploadResult.management_key}</span>
                          <button onClick={() => copyToClipboard(uploadResult.management_key)} className="bg-error text-white p-2 rounded-lg hover:opacity-80 transition-all">
                              <span className="material-symbols-outlined text-sm">content_copy</span>
                          </button>
                        </div>
                    </div>
                    
                    <button 
                      onClick={() => { setUploadResult(null); setFile(null); }}
                      className="w-full py-3 bg-on-surface text-white rounded-xl font-bold"
                    >
                      Done
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
