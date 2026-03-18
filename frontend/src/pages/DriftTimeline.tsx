import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { GitBranch, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { findingsApi } from '../services/api';
import { IamFinding } from '../types';
import { RiskBadge, WorkflowBadge } from '../components/ui/Badge';
import { Card, CardHeader } from '../components/ui/Card';

type GroupedFindings = Record<string, IamFinding[]>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DriftTimeline() {
  const [allFindings, setAllFindings] = useState<IamFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    findingsApi.list()
      .then((data) => {
        setAllFindings(data);
        // Auto-select first role
        if (data.length > 0) setSelectedRole(data[0].role_id);
      })
      .finally(() => setLoading(false));
  }, []);

  // Group by role_id
  const byRole: GroupedFindings = {};
  for (const f of allFindings) {
    if (!byRole[f.role_id]) byRole[f.role_id] = [];
    byRole[f.role_id].push(f);
  }

  // Sort each role's findings chronologically
  for (const roleId of Object.keys(byRole)) {
    byRole[roleId].sort((a, b) => new Date(a.scan_created_at).getTime() - new Date(b.scan_created_at).getTime());
  }

  const uniqueRoles = Object.keys(byRole).map((roleId) => ({
    roleId,
    roleName: byRole[roleId][0].role_name,
    latestRisk: byRole[roleId][byRole[roleId].length - 1].risk_level,
  }));

  const selectedFindings = selectedRole ? (byRole[selectedRole] ?? []) : [];

  const chartData = selectedFindings.map((f) => ({
    date: formatDate(f.scan_created_at),
    risk_score: f.risk_score,
    permissions: f.permission_count_before,
    permissions_after: f.permission_count_after,
    workflow: f.workflow_state,
    scan_id: f.scan_id,
  }));

  // Compute drift: first vs last
  const first = selectedFindings[0];
  const last = selectedFindings[selectedFindings.length - 1];
  const riskDelta = last && first ? last.risk_score - first.risk_score : 0;
  const permDelta = last && first ? last.permission_count_before - first.permission_count_before : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw size={20} className="animate-spin" /> Loading timeline...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-5">
        {/* Role selector */}
        <Card className="col-span-1" padding="sm">
          <CardHeader title="Roles" subtitle={`${uniqueRoles.length} monitored`} />
          <div className="space-y-1.5 max-h-[calc(100vh-20rem)] overflow-y-auto">
            {uniqueRoles.map(({ roleId, roleName, latestRisk }) => (
              <button
                key={roleId}
                onClick={() => setSelectedRole(roleId)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                  selectedRole === roleId
                    ? 'bg-sky-50 border border-sky-200 text-sky-700'
                    : 'hover:bg-slate-50 text-slate-600'
                }`}
              >
                <div className="font-medium truncate">{roleName}</div>
                <div className="mt-0.5">
                  <RiskBadge level={latestRisk} />
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Timeline content */}
        <div className="col-span-3 space-y-5">
          {!selectedRole || selectedFindings.length === 0 ? (
            <Card>
              <div className="flex items-center justify-center h-40 text-slate-400">
                <div className="text-center">
                  <GitBranch size={32} className="mx-auto mb-2 text-slate-300" />
                  <p>Select a role to view its drift timeline</p>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {/* Role summary */}
              <Card>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{last.role_name}</h3>
                    <p className="font-mono text-xs text-slate-400 mt-0.5">{last.role_arn}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RiskBadge level={last.risk_level} />
                    <WorkflowBadge state={last.workflow_state} />
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {riskDelta < 0 ? <TrendingDown size={16} className="text-emerald-500" /> : riskDelta > 0 ? <TrendingUp size={16} className="text-red-500" /> : null}
                      <span className={`text-xl font-bold ${riskDelta < 0 ? 'text-emerald-600' : riskDelta > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                        {riskDelta > 0 ? '+' : ''}{riskDelta}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Risk Score Change</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {permDelta < 0 ? <TrendingDown size={16} className="text-emerald-500" /> : null}
                      <span className={`text-xl font-bold ${permDelta < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                        {permDelta > 0 ? '+' : ''}{permDelta}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Permission Count Change</p>
                  </div>
                  <div className="text-center">
                    <span className="text-xl font-bold text-slate-700">{selectedFindings.length}</span>
                    <p className="text-xs text-slate-400 mt-0.5">Scans Recorded</p>
                  </div>
                </div>
              </Card>

              {/* Risk Score chart */}
              <Card>
                <CardHeader title="Risk Score Over Time" subtitle="Deterministic risk score per scan" />
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
                        formatter={(v: number) => [v, 'Risk Score']}
                      />
                      <ReferenceLine y={22} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'CRITICAL', position: 'right', fontSize: 10, fill: '#ef4444' }} />
                      <ReferenceLine y={13} stroke="#f97316" strokeDasharray="4 4" label={{ value: 'HIGH', position: 'right', fontSize: 10, fill: '#f97316' }} />
                      <ReferenceLine y={6} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'MEDIUM', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                      <Line
                        type="monotone"
                        dataKey="risk_score"
                        stroke="#ef4444"
                        strokeWidth={2.5}
                        dot={{ fill: '#ef4444', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-8">Only one scan on record — drift visible after next scan</p>
                )}
              </Card>

              {/* Permission chart */}
              <Card>
                <CardHeader title="Permission Count Over Time" subtitle="Before and after remediation" />
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
                      />
                      <Line type="monotone" dataKey="permissions" name="Before" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
                      <Line type="monotone" dataKey="permissions_after" name="After" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-8">Only one scan on record — drift visible after next scan</p>
                )}
              </Card>

              {/* Scan history table */}
              <Card>
                <CardHeader title="Scan History" subtitle="All recorded findings for this role" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs font-semibold text-slate-400 pb-2 pr-4">Scan Date</th>
                        <th className="text-left text-xs font-semibold text-slate-400 pb-2 pr-4">Risk</th>
                        <th className="text-right text-xs font-semibold text-slate-400 pb-2 pr-4">Score</th>
                        <th className="text-right text-xs font-semibold text-slate-400 pb-2 pr-4">Permissions</th>
                        <th className="text-left text-xs font-semibold text-slate-400 pb-2">Workflow State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {[...selectedFindings].reverse().map((f) => (
                        <tr key={f.scan_id} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-4 text-slate-600 text-xs">{formatDate(f.scan_created_at)}</td>
                          <td className="py-2.5 pr-4"><RiskBadge level={f.risk_level} /></td>
                          <td className="py-2.5 pr-4 text-right font-bold text-slate-800">{f.risk_score}</td>
                          <td className="py-2.5 pr-4 text-right text-slate-600">
                            <span className="text-red-500">{f.permission_count_before}</span>
                            <span className="text-slate-300 mx-1">→</span>
                            <span className="text-emerald-600">{f.permission_count_after}</span>
                          </td>
                          <td className="py-2.5"><WorkflowBadge state={f.workflow_state} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
