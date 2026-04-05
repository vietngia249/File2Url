import React, { useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import DownloadPage from './pages/DownloadPage';
import ManagePage from './pages/ManagePage';
import ManageIndex from './pages/ManageIndex';
import AuthModal from './components/AuthModal';

export default function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const openAuth = () => setIsAuthModalOpen(true);
  const closeAuth = () => setIsAuthModalOpen(false);

  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      localStorage.setItem('jwt_token', token);
      // Strip token from URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Open auth modal showing Connected state
      setIsAuthModalOpen(true);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* TopNavBar */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-[0_4px_24px_-1px_rgba(0,0,0,0.04)]">
        <div className="flex justify-between items-center px-8 py-4 w-full max-w-7xl mx-auto">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-indigo-700 dark:text-indigo-300">File2Url V2</span>
          </Link>
          <div className="flex justify-center flex-1 mx-8 hidden md:flex items-center gap-8">
            <Link 
              to="/" 
              className={`text-sm font-semibold transition-all pb-1 ${location.pathname === '/' ? 'text-indigo-700 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-primary'}`}
            >
              Home
            </Link>
            <Link 
              to="/manage" 
              className={`text-sm font-semibold transition-all pb-1 ${location.pathname.startsWith('/manage') ? 'text-indigo-700 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-primary'}`}
            >
              Manage
            </Link>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <button 
              onClick={openAuth}
              className="bg-surface-container-lowest text-on-surface-variant font-medium px-5 py-2 rounded-lg glass-panel hover:scale-[1.02] transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">account_circle</span>
              {userProfile ? 'Profile' : 'Sign In'}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow pt-32 pb-20 px-6 relative flex flex-col">
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/d/:id" element={<DownloadPage />} />
          <Route path="/manage" element={<ManageIndex />} />
          <Route path="/manage/:key" element={<ManagePage />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="bg-slate-50 dark:bg-slate-950 border-t border-transparent z-10">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-12 w-full max-w-7xl mx-auto">
          <div className="flex flex-col gap-2 mb-8 md:mb-0">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">File2Url V2</span>
            <span className="text-[12px] font-medium tracking-wide uppercase text-slate-400">
              © 2024 File2Url V2. The Ethereal Conduit.
            </span>
          </div>
          <div className="flex gap-8">
            <a className="text-[12px] font-medium tracking-wide uppercase text-slate-400 hover:text-indigo-500 transition-colors" href="#">Security</a>
            <a className="text-[12px] font-medium tracking-wide uppercase text-slate-400 hover:text-indigo-500 transition-colors" href="#">Developer Docs</a>
            <a className="text-[12px] font-medium tracking-wide uppercase text-slate-400 hover:text-indigo-500 transition-colors" href="#">Privacy</a>
          </div>
        </div>
      </footer>

      {/* Global Auth Modal */}
      {isAuthModalOpen && <AuthModal onClose={closeAuth} setUserProfile={setUserProfile} />}
    </div>
  );
}
