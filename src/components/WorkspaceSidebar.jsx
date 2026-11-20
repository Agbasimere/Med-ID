import React, { useState } from 'react';
import { ChevronRight, HeartPulse, PanelLeftClose } from 'lucide-react';

export default function WorkspaceSidebar({ accountType, userProfile, currentUser, groups, activeKey, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false);
  const fullName = userProfile?.full_name || currentUser?.email || 'MED-ID User';
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <aside className={`w-full shrink-0 transition-[width] duration-200 lg:sticky lg:top-20 lg:self-start ${collapsed ? 'lg:w-[76px]' : 'lg:w-[264px]'}`}>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`flex h-[76px] items-center border-b border-slate-100 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          {collapsed ? <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" title="Expand sidebar" className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-700">
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
            <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" className="hidden rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:inline-flex">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </>}
        </div>

        <nav className="space-y-5 px-3 py-5" aria-label={`${accountType} navigation`}>
          {groups.map((group) => <section key={group.label}>
            {!collapsed && <h2 className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{group.label}</h2>}
            <div className="space-y-1">
              {group.items.map(({ key, label, icon: Icon, badge }) => {
                const active = activeKey === key;
                return <button key={key} type="button" title={collapsed ? label : undefined} onClick={() => onNavigate(key)} aria-current={active ? 'page' : undefined} className={`group flex w-full items-center gap-3 rounded-xl border px-2.5 py-2.5 text-left text-xs font-semibold transition ${active ? 'border-brand-100 bg-brand-50 text-brand-800 shadow-sm' : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'} ${collapsed ? 'justify-center' : ''}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  {!collapsed && <><span className="min-w-0 flex-1 truncate">{label}</span>{badge !== undefined && <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] ${active ? 'bg-white text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{badge}</span>}<ChevronRight className={`h-3.5 w-3.5 ${active ? 'text-brand-500' : 'text-slate-300'}`} /></>}
                </button>;
              })}
            </div>
          </section>)}
        </nav>

        <div className={`border-t border-slate-100 bg-slate-50/70 p-3 ${collapsed ? 'flex justify-center' : ''}`}>
          <div className={`flex min-w-0 items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 ring-2 ring-white">{initials || 'M'}</div>
            {!collapsed && <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-800">{fullName}</p>
              <p className="truncate text-[10px] text-slate-500">{userProfile?.role || accountType}</p>
            </div>}
          </div>
        </div>
      </div>
    </aside>
  );
}
