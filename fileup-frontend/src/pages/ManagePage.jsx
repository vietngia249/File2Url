import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/ToastContext';

export default function ManagePage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Edit form state
  const [maxViews, setMaxViews] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const addToast = useToast();

  useEffect(() => {
    async function loadData() {
      try {
        const data = await api.getManagementInfo(key);
        setFileData(data);
        setMaxViews(data.max_views || 100);
        setExpiresAt(data.expires_at ? data.expires_at.slice(0, 16) : '');
      } catch (err) {
        addToast("Invalid management key or file has been deleted.", "error");
        navigate('/');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [key, navigate, addToast]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const exact_expires_at = new Date(expiresAt).toISOString();
      await api.updateFileSettings(key, { max_views: parseInt(maxViews), exact_expires_at });
      addToast("Settings synchronized.", "success");
      const data = await api.getManagementInfo(key);
      setFileData(data);
    } catch (err) {
      addToast("Update failed.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("WARNING: This will permanently delete the file from the universe. Proceed?")) return;
    try {
      await api.deleteFile(key);
      addToast("File permanently deleted.", "success");
      navigate('/');
    } catch (err) {
      addToast("Failed to delete file.", "error");
    }
  };

  if (loading) return <div className="p-20 text-center font-bold">Loading Management Protocol...</div>;

  return (
    <div className="max-w-7xl mx-auto w-full pt-10 px-6 md:px-12">
      
      {/* Header Banner Section */}
      <section className="mb-12 relative overflow-hidden rounded-3xl bg-surface-container-lowest p-8 md:p-12 shadow-[0_4px_24px_-1px_rgba(0,0,0,0.04)]">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div className="max-w-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <span className="px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold tracking-widest uppercase">Management Key Active</span>
                    <span className="text-on-surface-variant text-sm font-medium">• {fileData.metadata?.name || 'File'}</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-on-surface mb-6 leading-tight font-headline">
                    Refine the <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-tertiary">Conduit Path.</span>
                </h1>
                <div className="flex flex-wrap gap-6 mt-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">cloud_upload</span>
                        <div className="flex flex-col">
                            <span className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Size</span>
                            <span className="font-semibold text-sm">
                              {fileData.metadata?.size ? (fileData.metadata.size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">visibility</span>
                        <div className="flex flex-col">
                            <span className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Access</span>
                            <span className="font-semibold text-sm">Public Link</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">event</span>
                        <div className="flex flex-col">
                            <span className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Created</span>
                            <span className="font-semibold text-sm">
                              {new Date(fileData.created_at).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end">
                <div className="w-full md:w-auto px-6 py-4 rounded-2xl glass-panel shadow-sm flex items-center gap-4">
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-slate-200">
                          <img className="w-full h-full object-cover" src={`https://api.dicebear.com/7.x/notionists/svg?seed=${key}&backgroundColor=transparent`} alt="avatar" />
                      </div>
                      <div className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center bg-primary text-on-primary text-xs font-bold">+ {fileData.current_views}</div>
                    </div>
                    <p className="text-xs font-medium text-on-surface-variant">{fileData.current_views} viewers past</p>
                </div>
            </div>
        </div>
      </section>

      {/* Main Configuration Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Settings Form */}
        <div className="lg:col-span-7 space-y-8">
            <div className="bg-surface-container-lowest p-8 rounded-3xl shadow-[0_4px_24px_-1px_rgba(0,0,0,0.04)] relative">
                <h2 className="text-xl font-bold mb-8 flex items-center gap-2 font-headline">
                    <span className="material-symbols-outlined text-primary">settings</span>
                    Control Parameters
                </h2>
                <form onSubmit={handleUpdate} className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Expiry Date */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Expiry Date & Time</label>
                            <div className="relative flex items-center">
                                <input 
                                  className="w-full bg-surface-container-low border-0 rounded-xl px-4 py-4 focus:ring-2 focus:ring-primary-container transition-all font-medium text-sm" 
                                  type="datetime-local" 
                                  value={expiresAt} 
                                  onChange={e=>setExpiresAt(e.target.value)} 
                                  required
                                />
                            </div>
                            <p className="text-xs text-on-surface-variant px-1 italic">The conduit will automatically collapse at this time.</p>
                        </div>
                        {/* Max Views */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Max Views</label>
                            <div className="relative flex items-center">
                                <input 
                                  className="w-full bg-surface-container-low border-0 rounded-xl px-4 py-4 focus:ring-2 focus:ring-primary-container transition-all font-medium text-sm" 
                                  type="number" 
                                  value={maxViews}
                                  onChange={e=>setMaxViews(e.target.value)}
                                  required
                                />
                            </div>
                            <p className="text-xs text-on-surface-variant px-1 italic">Total download capacity before expiration.</p>
                        </div>
                    </div>
                    {/* Update Settings Action */}
                    <div className="pt-4 flex flex-col md:flex-row items-center gap-4">
                        <button 
                          type="submit" 
                          disabled={isUpdating}
                          className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-xl font-bold tracking-tight shadow-[0_10px_15px_-3px_rgba(53,37,205,0.15)] hover:scale-[1.02] transition-all disabled:opacity-70"
                        >
                            {isUpdating ? 'Updating...' : 'Update Settings'}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        {/* Right Column: Security & Stats */}
        <div className="lg:col-span-5 space-y-8">
            {/* Danger Zone */}
            <div className="bg-error-container/10 border-2 border-error/20 p-8 rounded-3xl relative overflow-hidden glass-panel">
                <div className="absolute top-0 left-0 w-1 h-full bg-error"></div>
                <h2 className="text-xl font-headline font-bold text-error mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined">warning</span>
                    Irreversible Void
                </h2>
                <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
                    Permanently sever this conduit. All data will be wiped from our ethereal servers. This action cannot be undone.
                </p>
                <button 
                  onClick={handleDelete}
                  className="w-full py-4 bg-error text-on-error rounded-xl font-bold tracking-tight hover:bg-error/90 transition-all flex items-center justify-center gap-2 group"
                >
                    <span className="material-symbols-outlined group-hover:animate-pulse">delete_forever</span>
                    Delete Permanently
                </button>
            </div>

            {/* Bento Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-[0_4px_24px_-1px_rgba(0,0,0,0.04)] text-center">
                    <div className="text-primary text-3xl font-extrabold mb-1 font-headline">{fileData.current_views}</div>
                    <div className="text-xs uppercase font-bold text-on-surface-variant tracking-wider">Views</div>
                </div>
                <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-[0_4px_24px_-1px_rgba(0,0,0,0.04)] text-center">
                    <div className="text-tertiary text-3xl font-extrabold mb-1 font-headline">{fileData.max_views - fileData.current_views}</div>
                    <div className="text-xs uppercase font-bold text-on-surface-variant tracking-wider">Remaining</div>
                </div>
            </div>

            {/* Abstract Visual Background for Stats */}
            <div className="h-48 rounded-3xl overflow-hidden relative group">
                <div className="w-full h-full bg-gradient-to-br from-[#3525cd] to-[#6f3dd9] opacity-80 group-hover:scale-110 transition-transform duration-700"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent flex items-end p-6">
                    <p className="text-on-primary font-bold text-sm tracking-wide">Visual flow of data transitions</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}
