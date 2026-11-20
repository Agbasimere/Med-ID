import React from 'react';
import { 
  Heart, 
  Scan, 
  ShieldCheck, 
  User, 
  Stethoscope, 
  LogOut, 
  LogIn
} from 'lucide-react';

export default function Navbar({ 
  currentView, 
  setCurrentView, 
  currentUser, 
  userProfile, 
  onOpenAuth, 
  onSignOut
}) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Logo */}
        <div 
          onClick={() => {
            if (!currentUser) setCurrentView('landing');
            else if (userProfile?.role === 'doctor') setCurrentView('doctor');
            else if (userProfile?.role === 'patient') setCurrentView('patient');
            else if (userProfile?.role === 'admin') setCurrentView('admin');
          }} 
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform">
            <Scan className="w-5 h-5 absolute text-brand-200 animate-pulse" />
            <Heart className="w-3.5 h-3.5 text-emergency-500 fill-emergency-500 z-10" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight text-slate-900 group-hover:text-brand-600 transition-colors">
                MED<span className="text-brand-600">ID</span>
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium tracking-wide">
              Emergency Health Identification System
            </p>
          </div>
        </div>

        {/* Center Navigation Links: ONLY shown when user is logged in */}
        {currentUser && (
          <nav className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            {userProfile?.role === 'doctor' && (
              <button
                onClick={() => setCurrentView('doctor')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emergency-600 text-white shadow-sm"
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>ER Trauma Bay Scanner</span>
              </button>
            )}

            {userProfile?.role === 'patient' && (
              <button
                onClick={() => setCurrentView('patient')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-900 shadow-sm"
              >
                <User className="w-3.5 h-3.5 text-brand-600" />
                <span>My Medical Profile</span>
              </button>
            )}

            {userProfile?.role === 'admin' && (
              <button
                  onClick={() => setCurrentView('admin')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentView === 'admin' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin Console</span>
              </button>
            )}
          </nav>
        )}

        {/* Right Controls & Auth */}
        <div className="flex items-center gap-3">
          
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col text-right">
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  {userProfile?.full_name || currentUser.email}
                </span>
                <span className="text-[10px] uppercase font-bold text-brand-600 tracking-wider">
                  {userProfile?.role === 'doctor' ? 'ER Physician' : userProfile?.role === 'admin' ? 'Super Admin' : 'Patient'}
                </span>
              </div>

              <button
                onClick={onSignOut}
                title="Sign Out"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors flex items-center gap-1 text-xs font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAuth('doctor', 'signin')}
                className="corporate-btn-secondary !py-1.5 !px-3.5 !text-xs gap-1.5 hidden sm:inline-flex"
              >
                <Stethoscope className="w-3.5 h-3.5 text-emergency-600" />
                <span>Doctor Portal</span>
              </button>

              <button
                onClick={() => onOpenAuth('patient', 'signup')}
                className="corporate-btn-primary !py-1.5 !px-3.5 !text-xs gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In / Register</span>
              </button>
            </div>
          )}

        </div>

      </div>
    </header>
  );
}
