import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  ShieldAlert, TrendingDown, CheckCircle2, Clock,
  Zap, AlertTriangle, Play, RefreshCw,
} from 'lucide-react';
import { dashboardApi, scansApi } from '../services/api';
import { DashboardMetrics, IamScan, HealthScoreEntry } from '../types';
import { MetricCard } from '../components/ui/MetricCard';
import { Card, CardHeader } from '../components/ui/Card';
import { healthScoreColor, healthScoreBg } from '../components/ui/Badge';

const RISK_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#10b981',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [health, setHealth] = useState<HealthScoreEntry[]>([]);
  const [scans, setScans] = useState<IamScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanTriggerLoading, setScanTriggerLoading] = useState(false);
  const [scanTriggered, setScanTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [m, h, s] = await Promise.all([
          dashboardApi.getMetrics(),
          dashboardApi.getHealth(),
          scansApi.list(),
        ]);
        setMetrics(m);
        setHealth(h.history);
        setScans(s.slice(0, 10));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleTriggerScan() {
    if (!metrics) return;
    setScanTriggerLoading(true);
    try {
      await scansApi.trigger(metrics.account.account_id, metrics.account.account_name);
      setScanTriggered(true);
      setTimeout(() => setScanTriggered(false), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan trigger failed');
    } finally {
      setScanTriggerLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw size={20} className="animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-semibold">Failed to load dashboard</p>
        <p className="text-sm mt-1">{error ?? 'No data available'}</p>
      </div>
    );
  }

  const score = metrics.account.health_score;
  const scoreColor = healthScoreColor(score);
  const scoreBg = healthScoreBg(score);

  const riskChartData = [
    { name: 'Critical', count: metrics.risk_distribution.CRITICAL, fill: RISK_COLORS.CRITICAL },
    { name: 'High', count: metrics.risk_distribution.HIGH, fill: RISK_COLORS.HIGH },
    { name: 'Medium', count: metrics.risk_distribution.MEDIUM, fill: RISK_COLORS.MEDIUM },
    { name: 'Low', count: metrics.risk_distribution.LOW, fill: RISK_COLORS.LOW },
  ];

  const healthChartData = health.map((h) => ({
    date: formatDate(h.recorded_at),
    score: h.score,
    scan_id: h.scan_id,
  }));

  return (
    <div className="space-y-6">
      {/* Scan triggered banner */}
      {scanTriggered && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-5 py-3 flex items-center gap-3 text-sky-700">
          <RefreshCw size={16} className="animate-spin flex-shrink-0" />
          <span className="text-sm font-medium">Scan in progress — findings will appear shortly.</span>
        </div>
      )}

      {/* Top row: health score + trigger button */}
      <div className="flex items-start gap-6">
        {/* Health score card */}
        <div className={`bg-white rounded-xl border ${scoreBg} shadow-sm p-6 flex flex-col items-center min-w-[180px]`}>
          <p className="text-sm font-medium text-slate-500 mb-1">IAM Health Score</p>
          <p className={`text-6xl font-bold ${scoreColor} leading-none`}>{score}</p>
          <p className="text-slate-400 text-sm mt-1">/ 100</p>
          <p className={`text-xs font-semibold mt-3 ${scoreColor}`}>
            {score >= 80 ? '● Healthy' : score >= 60 ? '● Moderate Risk' : '● High Risk'}
          </p>
          <p className="text-xs text-slate-400 mt-1">{metrics.account.account_name}</p>
        </div>

        {/* Metric cards */}
        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Roles Scanned"
            value={metrics.total_findings}
            subtext="this scan"
            icon={ShieldAlert}
            color="blue"
          />
          <MetricCard
            label="Roles Remediated"
            value={metrics.applied_count}
            subtext="policies applied"
            icon={CheckCircle2}
            color="emerald"
          />
          <MetricCard
            label="Avg Permission Reduction"
            value={`${metrics.avg_permission_reduction_pct}%`}
            subtext="across approved findings"
            icon={TrendingDown}
            color="purple"
          />
          <MetricCard
            label="Pending Review"
            value={metrics.pending_review}
            subtext="awaiting approval"
            icon={Clock}
            color="amber"
          />
        </div>
      </div>

      {/* Before/After metrics + trigger scan */}
      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader title="Before vs After Remediation" subtitle="Wildcard permissions and permission reduction across approved findings" />
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Wildcard Permissions</p>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-red-500">{metrics.total_wildcard_actions_before}</p>
                    <p className="text-xs text-slate-400 mt-0.5">before</p>
                  </div>
                  <div className="flex flex-col items-center text-slate-300">
                    <span className="text-lg">→</span>
                    <span className="text-xs text-emerald-600 font-semibold whitespace-nowrap">
                      -{metrics.total_wildcard_actions_before - metrics.total_wildcard_actions_after} removed
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-emerald-600">{metrics.total_wildcard_actions_after}</p>
                    <p className="text-xs text-slate-400 mt-0.5">after</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Total wildcard actions (e.g. <code className="font-mono">s3:*</code>) across all {metrics.total_findings} roles
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Avg Permission Reduction</p>
                {metrics.approved_count + metrics.applied_count > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-emerald-600">{metrics.avg_permission_reduction_pct}%</p>
                    <p className="text-xs text-slate-400 mt-0.5">across {metrics.approved_count + metrics.applied_count} approved findings</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 italic">No approved findings yet</p>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Remediation Progress</p>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5">
                    <div
                      className="bg-emerald-500 h-2.5 rounded-full transition-all"
                      style={{ width: `${metrics.total_findings > 0 ? ((metrics.applied_count + metrics.approved_count) / metrics.total_findings) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-600">
                    {metrics.total_findings > 0
                      ? Math.round(((metrics.applied_count + metrics.approved_count) / metrics.total_findings) * 100)
                      : 0}%
                  </span>
                </div>
                <p className="text-xs text-slate-400">{metrics.applied_count + metrics.approved_count} of {metrics.total_findings} approved</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Review Status</p>
                {metrics.total_findings === 0 ? (
                  <p className="text-sm text-slate-400 italic">No findings yet — trigger a scan</p>
                ) : (
                  <div className="space-y-1.5">
                    {[
                      { label: 'Pending review', count: metrics.pending_review, cls: 'text-amber-600 bg-amber-50' },
                      { label: 'Approved', count: metrics.approved_count + metrics.applied_count, cls: 'text-emerald-700 bg-emerald-50' },
                      { label: 'Rejected', count: metrics.rejected_count, cls: 'text-red-500 bg-red-50' },
                    ].map(({ label, count, cls }) => (
                      <div key={label} className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${cls}`}>
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-sm font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Manual Scan" subtitle="Trigger an immediate scan" />
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-slate-700">{metrics.account.account_name}</p>
              <p className="text-slate-400 text-xs mt-0.5">{metrics.account.account_id}</p>
              {metrics.latest_scan.scan_completed_at && (
                <p className="text-slate-400 text-xs mt-1">
                  Last scan: {formatDate(metrics.latest_scan.scan_completed_at)}
                </p>
              )}
            </div>
            <button
              onClick={handleTriggerScan}
              disabled={scanTriggerLoading || scanTriggered}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                scanTriggerLoading || scanTriggered
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm'
              }`}
            >
              {scanTriggerLoading ? (
                <><RefreshCw size={15} className="animate-spin" /> Triggering...</>
              ) : scanTriggered ? (
                <><CheckCircle2 size={15} /> Scan in Progress</>
              ) : (
                <><Play size={15} /> Trigger Scan</>
              )}
            </button>
            {scanTriggered && (
              <p className="text-xs text-sky-600 text-center">
                Scan queued. Refresh in a few minutes.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Health score time-series */}
        <Card>
          <CardHeader
            title="Health Score History"
            subtitle="30-scan rolling window"
          />
          {healthChartData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              No history yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={healthChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
                  formatter={(v: number) => [`${v}/100`, 'Health Score']}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  dot={{ fill: '#0ea5e9', r: 3 }}
                  activeDot={{ r: 5 }}
                />
                {/* Reference lines for thresholds */}
                <Line dataKey={() => 80} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1} dot={false} legendType="none" />
                <Line dataKey={() => 60} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} dot={false} legendType="none" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Risk distribution */}
        <Card>
          <CardHeader title="Risk Distribution" subtitle="Findings by severity level" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={riskChartData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {riskChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Recent scans */}
      <Card>
        <CardHeader
          title="Recent Scans"
          subtitle="Scan history for this account"
          action={
            <button
              onClick={() => navigate('/queue')}
              className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1"
            >
              View Queue <Zap size={12} />
            </button>
          }
        />
        <div className="space-y-2">
          {scans.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No scans yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-400 pb-2 pr-4">Scan ID</th>
                    <th className="text-left text-xs font-semibold text-slate-400 pb-2 pr-4">Status</th>
                    <th className="text-right text-xs font-semibold text-slate-400 pb-2 pr-4">Roles</th>
                    <th className="text-right text-xs font-semibold text-slate-400 pb-2 pr-4">High Risk</th>
                    <th className="text-right text-xs font-semibold text-slate-400 pb-2 pr-4">Health</th>
                    <th className="text-left text-xs font-semibold text-slate-400 pb-2">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {scans.map((scan) => (
                    <tr key={scan.scan_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-slate-600">{scan.scan_id.slice(-20)}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          scan.scan_status === 'COMPLETE' ? 'bg-emerald-100 text-emerald-700' :
                          scan.scan_status === 'IN_PROGRESS' ? 'bg-sky-100 text-sky-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {scan.scan_status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-medium text-slate-700">{scan.total_roles_scanned}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <span className="text-orange-600 font-semibold">{scan.high_risk_count}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <span className={`font-bold ${healthScoreColor(scan.health_score)}`}>{scan.health_score}</span>
                      </td>
                      <td className="py-2.5 text-slate-400 text-xs">{formatDate(scan.scan_started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Alert icons for high/critical */}
      {(metrics.risk_distribution.CRITICAL > 0 || metrics.risk_distribution.HIGH > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">
              {metrics.risk_distribution.CRITICAL} Critical + {metrics.risk_distribution.HIGH} High risk roles detected
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              Review the Remediation Queue to approve AI-generated least-privilege policies.
            </p>
          </div>
          <button
            onClick={() => navigate('/queue')}
            className="ml-auto text-xs font-semibold text-orange-700 hover:text-orange-900 bg-orange-100 hover:bg-orange-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            Go to Queue
          </button>
        </div>
      )}
    </div>
  );
}
