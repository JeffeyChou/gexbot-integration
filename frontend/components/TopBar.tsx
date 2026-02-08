import React from 'react';
import { Bell, User, Wifi } from 'lucide-react';

export const TopBar: React.FC<{ title: string }> = ({ title }) => {
  return (
    <header className="h-16 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-40">
      <h1 className="text-xl font-semibold text-gray-100 tracking-tight">{title}</h1>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-2 text-xs font-mono text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          <Wifi size={12} />
          <span>SYSTEM ONLINE</span>
        </div>

        <button className="text-gray-400 hover:text-white transition-colors relative">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${sessionStorage.getItem('userRole') === 'admin' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
            {sessionStorage.getItem('userRole')?.toUpperCase() || 'VIEWER'}
          </span>
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border border-gray-600">
            <User size={16} className="text-gray-300" />
          </div>
        </div>
      </div>
    </header>
  );
};