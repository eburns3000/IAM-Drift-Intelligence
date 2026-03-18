import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Security Posture Dashboard', subtitle: 'IAM health score, risk distribution, and scan history for TechCorp' },
  '/queue': { title: 'Remediation Queue', subtitle: 'Pending IAM findings awaiting review and approval' },
  '/roles': { title: 'Role Detail', subtitle: 'Deep-dive into individual IAM role findings and AI-generated remediation' },
  '/drift': { title: 'Drift Timeline', subtitle: 'Permission changes and risk evolution across scan history' },
  '/policies': { title: 'Policy Versions', subtitle: 'Applied policies, version history, and rollback controls' },
  '/report': { title: 'Executive Report', subtitle: 'AI-generated governance summary for leadership review' },
};

export default function Layout() {
  const location = useLocation();
  const pathname = '/' + location.pathname.split('/')[1];
  const page = pageTitles[pathname] ?? { title: 'IAM Drift Intelligence', subtitle: '' };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <main className="flex-1 ml-64 flex flex-col min-h-screen">
        <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{page.title}</h1>
              <p className="text-sm text-slate-500 mt-0.5">{page.subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
                Part of the Cloud Operations Platform
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live · TechCorp</span>
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
