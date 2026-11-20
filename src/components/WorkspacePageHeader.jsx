import React from 'react';
import { ChevronRight } from 'lucide-react';

export default function WorkspacePageHeader({ accountType, section, title, description, actions }) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-slate-500">
          <span>{accountType}</span><ChevronRight className="h-3 w-3 text-slate-300" /><span>{section}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
