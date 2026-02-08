import React, { useState } from 'react';
import { Activity, Server, Settings, FileText, Cpu, LayoutDashboard } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { DevOpsGuide } from './components/DevOpsGuide';
import { SettingsPanel } from './components/SettingsPanel';
import { TopBar } from './components/TopBar';
import { Login } from './components/Login';
import { LogOut } from 'lucide-react';

enum View {
  DASHBOARD = 'DASHBOARD',
  DEVOPS = 'DEVOPS',
  SETTINGS = 'SETTINGS',
}

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    sessionStorage.getItem('isAuthenticated') === 'true'
  );

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLogin={setIsAuthenticated} />;
  }

  const renderView = () => {
    switch (currentView) {
      case View.DASHBOARD:
        return <Dashboard />;
      case View.DEVOPS:
        return <DevOpsGuide />;
      case View.SETTINGS:
        return <SettingsPanel />;
      default:
        return <Dashboard />;
    }
  };

  const userRole = sessionStorage.getItem('userRole') || 'viewer';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-20 bg-gray-900 border-r border-gray-800 flex flex-row md:flex-col items-center py-4 md:py-8 justify-between md:justify-start gap-0 md:gap-8 z-50 sticky top-0 md:h-screen">
        <div className="px-4 md:px-0 mb-0 md:mb-8">
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Activity className="text-white w-6 h-6" />
          </div>
        </div>

        <div className="flex flex-row md:flex-col gap-2 md:gap-6 px-4 md:px-0">
          <NavButton
            active={currentView === View.DASHBOARD}
            onClick={() => setCurrentView(View.DASHBOARD)}
            icon={<LayoutDashboard size={24} />}
            label="Dash"
          />
          {userRole === 'admin' && (
            <>
              <NavButton
                active={currentView === View.DEVOPS}
                onClick={() => setCurrentView(View.DEVOPS)}
                icon={<Server size={24} />}
                label="Infra"
              />
              <NavButton
                active={currentView === View.SETTINGS}
                onClick={() => setCurrentView(View.SETTINGS)}
                icon={<Settings size={24} />}
                label="Config"
              />
            </>
          )}
        </div>

        <div className="hidden md:flex flex-col mt-auto gap-4 items-center mb-8">
          <NavButton
            active={false}
            onClick={handleLogout}
            icon={<LogOut size={24} />}
            label="Logout"
          />
          <span className="opacity-50 text-[10px] mt-2">v1.0.5</span>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <TopBar title={
          currentView === View.DASHBOARD ? 'Financial Intelligence Dashboard' :
            currentView === View.DEVOPS ? 'Architecture & Deployment' : 'System Configuration'
        } />

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {renderView()}
        </div>
      </main>
    </div>
  );
};

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`p-3 rounded-xl transition-all duration-200 group relative flex items-center justify-center ${active
      ? 'bg-gray-800 text-emerald-400 shadow-md border border-gray-700'
      : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/50'
      }`}
    title={label}
  >
    {icon}
    {/* Tooltip for desktop */}
    <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block border border-gray-700 pointer-events-none z-50">
      {label}
    </span>
  </button>
);

export default App;