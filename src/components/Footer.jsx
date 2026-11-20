import React from 'react';
import { Heart, Lock } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200/90 mt-20 pt-10 pb-8 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white">
              <Heart className="w-4 h-4 fill-white text-white" />
            </div>
            <div>
              <span className="text-base font-extrabold text-slate-900 tracking-tight">
                MED<span className="text-brand-600">ID</span>
              </span>
              <p className="text-[11px] text-slate-500">
                Emergency health identification platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
            <span>Face identification</span>
            <span>•</span>
            <span>Structured emergency records</span>
            <span>•</span>
            <span>Auditable access</span>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
          <div className="flex items-center gap-2 text-slate-500">
            <Lock className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <span>Emergency profile access for authorized care teams.</span>
          </div>
          <p>© {new Date().getFullYear()} Med ID Systems.</p>
        </div>

      </div>
    </footer>
  );
}
