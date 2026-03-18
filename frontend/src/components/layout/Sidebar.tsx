import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ListChecks,
  Search,
  GitBranch,
  FileStack,
  FileText,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/queue', label: 'Remediation Queue', icon: ListChecks },
  { to: '/roles', label: 'Role Detail', icon: Search },
  { to: '/drift', label: 'Drift Timeline', icon: GitBranch },
  { to: '/policies', label: 'Policy Versions', icon: FileStack },
  { to: '/report', label: 'Executive Report', icon: FileText },
];

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-slate-900 flex flex-col z-30">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
        <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={18} className="text-white" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">IAM Drift</p>
          <p className="text-slate-400 text-xs">Intelligence Platform</p>
        </div>
      </div>

      {/* Client badge */}
      <div className="px-6 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2 bg-slate-800 rounded-md px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
          <span className="text-slate-300 text-xs font-medium">TechCorp · AWS Security</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 pb-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
          Navigation
        </p>
        {nav.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={16} className="flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight size={14} className="opacity-70" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-800">
        <div className="text-slate-500 text-xs space-y-0.5">
          <p className="font-medium text-slate-400">Cloud Operations Platform</p>
          <p>MigrationOps · SentinelOps · IAM Drift</p>
          <p className="text-slate-600 text-xs mt-1">v1.0.0 · Powered by Claude</p>
        </div>
      </div>
    </aside>
  );
}
