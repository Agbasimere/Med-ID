import React, { useEffect, useState } from 'react';
import { ChevronRight, HeartPulse, Menu, PanelLeftClose, X } from 'lucide-react';

export default function WorkspaceSidebar({ accountType, userProfile, currentUser, groups, activeKey, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const fullName = userProfile?.full_name || currentUser?.email || 'MED-ID User';
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const activeLabel = groups.flatMap((group) => group.items).find((item) => item.key === activeKey)?.label || 'Menu';

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const closeOnEscape = (event) => event.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const content = (mobile = false) => (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`flex h-[76px] shrink-0 items-center border-b border-slate-100 ${collapsed && !mobile ? 'justify-center px-2' : 'justify-between px-4'}`}>
        {collapsed && !mobile ? <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" title="Expand sidebar" className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-700">
          <HeartPulse className="h-5 w-5" />
        </button> : <>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-700">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight text-slate-900">MED<span className="text-brand-600">ID</span></p>
              <p className="truncate text-[10px] font-medium text-slate-500">{accountType} workspace</p>
            </div>
          </div>
          {mobile ? <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button> : <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" className="hidden rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:inline-flex">
            <PanelLeftClose className="h-4 w-4" />
          </button>}
        </>}
      </div>

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-5" aria-label={`${accountType} navigation`}>
        {groups.map((group) => <section key={group.label}>
          {(!collapsed || mobile) && <h2 className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{group.label}</h2>}
          <div className="space-y-1">
            {group.items.map(({ key, label, icon: Icon, badge }) => {
              const active = activeKey === key;
              return <button key={key} type="button" title={collapsed && !mobile ? label : undefined} onClick={() => { onNavigate(key); setMobileOpen(false); }} aria-current={active ? 'page' : undefined} className={`group flex min-h-11 w-full items-center gap-3 rounded-xl border px-2.5 py-2.5 text-left text-xs font-semibold transition ${active ? 'border-brand-100 bg-brand-50 text-brand-800 shadow-sm' : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'} ${collapsed && !mobile ? 'justify-center' : ''}`}>
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                {(!collapsed || mobile) && <><span className="min-w-0 flex-1 truncate">{label}</span>{badge !== undefined && <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] ${active ? 'bg-white text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{badge}</span>}<ChevronRight className={`h-3.5 w-3.5 ${active ? 'text-brand-500' : 'text-slate-300'}`} /></>}
              </button>;
            })}
          </div>
        </section>)}
      </nav>

      <div className={`shrink-0 border-t border-slate-100 bg-slate-50/70 p-3 ${collapsed && !mobile ? 'flex justify-center' : ''}`}>
        <div className={`flex min-w-0 items-center gap-3 ${collapsed && !mobile ? 'justify-center' : ''}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 ring-2 ring-white">{initials || 'M'}</div>
          {(!collapsed || mobile) && <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-800">{fullName}</p>
            <p className="truncate text-[10px] text-slate-500">{userProfile?.role || accountType}</p>
          </div>}
        </div>
      </div>
    </div>
  );

  return <>
    <div className="lg:hidden">
      <button type="button" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-haspopup="dialog" className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left shadow-sm hover:bg-slate-50">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Menu className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{accountType} menu</span><span className="block truncate text-xs font-bold text-slate-800">{activeLabel}</span></span>
        <ChevronRight className="h-4 w-4 rotate-90 text-slate-400" />
      </button>
      {mobileOpen && <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
        <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" />
        <aside role="dialog" aria-modal="true" aria-label={`${accountType} navigation`} className="absolute inset-y-0 left-0 flex w-[min(19rem,88vw)] flex-col bg-slate-50 p-3 shadow-2xl animate-fadeIn">
          {content(true)}
        </aside>
      </div>}
    </div>
    <aside className={`hidden shrink-0 transition-[width] duration-200 lg:sticky lg:top-20 lg:block lg:self-start ${collapsed ? 'lg:w-[76px]' : 'lg:w-[264px]'}`}>
      {content(false)}
    </aside>
  </>;
}
