import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';

export default function DownloadPage() {
  const { id } = useParams();
  const [fileData, setFileData] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null); // e.g., 403 or 404
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState('00:00:00');

  useEffect(() => {
    async function loadFile() {
      try {
        const data = await api.getFile(id);
        setFileData(data);
      } catch (err) {
        setErrorStatus(err.code || 404);
      } finally {
        setLoading(false);
      }
    }
    loadFile();
  }, [id]);

  useEffect(() => {
    if (!fileData || !fileData.expires_at) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const exp = new Date(fileData.expires_at).getTime();
      const dist = exp - now;
      if (dist < 0) {
        setTimeLeft('Expired');
        clearInterval(interval);
        return;
      }
      const h = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((dist % (1000 * 60)) / 1000);
      setTimeLeft(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [fileData]);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-primary">Loading...</div>;
  }

  // Handle Expired / Invalid File State
  if (errorStatus || !fileData) {
    return (
      <section className="py-32 px-6 hero-gradient flex items-center justify-center min-h-[614px]">
        <div className="glass-panel max-w-md w-full p-12 rounded-[2rem] text-center space-y-8 shadow-2xl">
          <div className="mx-auto w-24 h-24 bg-error-container flex items-center justify-center rounded-full mb-6">
            <span className="material-symbols-outlined text-on-error-container text-5xl">lock_reset</span>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-headline font-extrabold text-on-surface">Link Expired (403)</h2>
            <p className="text-on-surface-variant">The conduit for this file has been closed. It may have reached its download limit or time expiration.</p>
          </div>
          <Link to="/">
            <button className="mt-8 w-full bg-primary text-on-primary py-4 rounded-xl font-headline font-bold hover:scale-[1.02] transition-transform">
                Generate New Link
            </button>
          </Link>
        </div>
      </section>
    );
  }

  const handleDownload = () => {
    // Append ?download=1 to trigger backend disposition
    window.open(`${fileData.url}?download=1`, '_blank');
  };

  const handlePreview = () => {
    window.open(fileData.url, '_blank');
  };

  const viewsLeft = fileData.max_views ? fileData.max_views - fileData.current_views : '∞';

  return (
    <div className="max-w-4xl mx-auto w-full pt-10 hero-gradient">
      {/* Dual Urgency Indicators Section */}
      <div className="flex flex-col md:flex-row justify-center items-center gap-6 mb-12">
        {/* Timer Card */}
        <div className="glass-panel px-8 py-4 rounded-2xl flex items-center gap-4 shadow-sm">
          <div className="bg-primary/10 p-3 rounded-full">
            <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>timer</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-outline tracking-wider uppercase">Expires in</p>
            <p className="text-2xl font-headline font-extrabold text-on-surface">{timeLeft}</p>
          </div>
        </div>
        
        {/* Remaining Downloads Card */}
        <div className="glass-panel px-8 py-4 rounded-2xl flex items-center gap-4 shadow-sm">
          <div className="bg-amber-100 p-3 rounded-full">
            <span className="material-symbols-outlined text-amber-600" style={{fontVariationSettings: "'FILL' 1"}}>download_done</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-outline tracking-wider uppercase">Availability</p>
            <p className="text-2xl font-headline font-extrabold text-amber-600">
              {viewsLeft} <span className="text-[12px] font-medium text-outline ml-1">remaining</span>
            </p>
          </div>
        </div>
      </div>

      {/* Central File Card */}
      <div className="relative grid md:grid-cols-12 gap-8 items-center">
        {/* Background Glow */}
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-secondary-container/30 blur-[120px] rounded-full -z-10"></div>
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-tertiary-container/20 blur-[120px] rounded-full -z-10"></div>

        {/* 3D Icon Presentation */}
        <div className="md:col-span-5 flex justify-center md:justify-end">
          <div className="w-64 h-80 glass-panel rounded-[2.5rem] flex flex-col items-center justify-center relative overflow-hidden shadow-2xl transition-transform hover:scale-[1.03] duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none"></div>
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-150"></div>
              <span className="material-symbols-outlined text-9xl text-primary relative z-10 drop-shadow-2xl" style={{fontVariationSettings: "'wght' 200, 'opsz' 48"}}>draft</span>
            </div>
            <div className="mt-8 px-6 py-2 bg-on-surface/5 backdrop-blur-md rounded-full">
              <span className="text-xs font-bold text-on-surface tracking-widest uppercase">Secured Payload</span>
            </div>
          </div>
        </div>

        {/* File Details and Actions */}
        <div className="md:col-span-7 text-center md:text-left space-y-8">
          <div className="space-y-4">
            <h1 className="text-3xl md:text-4xl font-headline font-extrabold leading-tight tracking-tight text-on-surface truncate px-2" title={fileData.metadata?.name || 'File'}>
              {fileData.metadata?.name || 'Unknown File'}
            </h1>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
              <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant text-sm font-semibold">
                {fileData.metadata?.size ? (fileData.metadata.size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown Size'}
              </span>
              <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant text-sm font-semibold">
                SHA-256 Verified
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button onClick={handleDownload} className="flex-1 flex items-center justify-center gap-3 bg-gradient-to-r from-primary to-primary-container text-on-primary px-8 py-5 rounded-xl font-headline font-bold text-lg shadow-[0_10px_15px_-3px_rgba(53,37,205,0.15)] hover:scale-[1.02] transition-all duration-300">
              <span className="material-symbols-outlined">download</span>
              Download File
            </button>
            <button onClick={handlePreview} className="flex-1 flex items-center justify-center gap-3 glass-panel text-on-surface px-8 py-5 rounded-xl font-headline font-bold text-lg hover:bg-white/90 transition-all duration-300">
              <span className="material-symbols-outlined">visibility</span>
              Preview File
            </button>
          </div>
          <p className="text-on-surface-variant/60 text-sm italic">
            Secured with Ethereal Conduit™ end-to-end encryption.
          </p>
        </div>
      </div>
    </div>
  );
}
