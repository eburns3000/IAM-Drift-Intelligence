import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileStack, RefreshCw, RotateCcw, CheckCircle2, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { findingsApi } from '../services/api';
import { IamFinding, PolicyHistoryEntry } from '../types';
import { RiskBadge, WorkflowBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';

// ─── Rollback Modal ────────────────────────────────────────────────────────────

function RollbackModal({
  finding,
  onConfirm,
  onCancel,
  loading,
}: {
  finding: IamFinding;
  onConfirm: (rolledBackBy: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [rolledBackBy, setRolledBackBy] = useState('');

  const lastHistory = finding.policy_history[finding.policy_history.length - 1];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Confirm Rollback</h2>
          <p className="text-sm text-slate-500 mt-1">Roll back policy for <strong>{finding.role_name}</strong></p>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">Rollback Details</p>
            <p className="text-xs text-amber-700">
              This will restore the policy to version {lastHistory?.version ?? 'N/A'} and set workflow state to <strong>rolled_back</strong>.
            </p>
          </div>
          {lastHistory && (
            <div className="text-xs text-slate-500 space-y-1">
              <p><strong>Restore to version:</strong> {lastHistory.version}</p>
              <p><strong>Changed by:</strong> {lastHistory.changed_by}</p>
              <p><strong>Reason:</strong> {lastHistory.change_reason}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Your Name *</label>
            <input
              type="text"
              value={rolledBackBy}
              onChange={(e) => setRolledBackBy(e.target.value)}
              placeholder="your.name@company.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(rolledBackBy)}
            disabled={!rolledBackBy || loading}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              !rolledBackBy || loading
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Rolling back...</> : <><RotateCcw size={14} /> Confirm Rollback</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Version History Table ────────────────────────────────────────────────────

function VersionHistory({ entries }: { entries: PolicyHistoryEntry[] }) {
  if (entries.length === 0) return <p className="text-xs text-slate-400 py-2">No version history</p>;

  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left font-semibold text-slate-400 pb-2 pr-4">Version</th>
            <th className="text-left font-semibold text-slate-400 pb-2 pr-4">Changed At</th>
            <th className="text-left font-semibold text-slate-400 pb-2 pr-4">Changed By</th>
            <th className="text-left font-semibold text-slate-400 pb-2">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {[...entries].reverse().map((e) => (
            <tr key={e.version} className="hover:bg-slate-50">
              <td className="py-2 pr-4 font-mono font-semibold text-slate-700">v{e.version}</td>
              <td className="py-2 pr-4 text-slate-500">
                {new Date(e.changed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-2 pr-4 text-slate-600">{e.changed_by}</td>
              <td className="py-2 text-slate-500">{e.change_reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PolicyVersions() {
  const navigate = useNavigate();
  const [findings, setFindings] = useState<IamFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollbackTarget, setRollbackTarget] = useState<IamFinding | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const all = await findingsApi.list();
      // Show findings with policy history or applied/rolled_back state
      const versioned = all.filter(
        (f) =>
          f.policy_version > 1 ||
          f.workflow_state === 'applied' ||
          f.workflow_state === 'rolled_back' ||
          f.policy_history.length > 0
      );
      setFindings(versioned.sort((a, b) => b.policy_version - a.policy_version));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRollback(rolledBackBy: string) {
    if (!rollbackTarget) return;
    setActionLoading(true);
    try {
      const updated = await findingsApi.rollback(
        rollbackTarget.role_id,
        rollbackTarget.scan_id,
        rolledBackBy
      );
      setFindings((prev) => prev.map((f) => f.role_id === updated.role_id ? updated : f));
      setSuccessMsg(`✓ ${rollbackTarget.role_name} rolled back to previous policy`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rollback failed');
    } finally {
      setActionLoading(false);
      setRollbackTarget(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw size={20} className="animate-spin" /> Loading policy versions...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {rollbackTarget && (
        <RollbackModal
          finding={rollbackTarget}
          onConfirm={handleRollback}
          onCancel={() => setRollbackTarget(null)}
          loading={actionLoading}
        />
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 flex items-center gap-2 text-emerald-700 text-sm font-medium">
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {findings.length} Role{findings.length !== 1 ? 's' : ''} with Policy History
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Applied policies, version history, and rollback controls</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {findings.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FileStack size={40} className="mb-3 text-slate-300" />
            <p className="font-semibold text-slate-600">No policy history yet</p>
            <p className="text-sm mt-1">Approved and applied findings will appear here</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {findings.map((f) => {
            const canRollback = f.workflow_state === 'applied' && !!f.applied_policy;
            const isExpanded = expandedRoleId === f.role_id;

            return (
              <Card key={f.role_id} padding="none">
                <div
                  className="p-5 cursor-pointer"
                  onClick={() => setExpandedRoleId(isExpanded ? null : f.role_id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-slate-900">{f.role_name}</span>
                        <RiskBadge level={f.risk_level} />
                        <WorkflowBadge state={f.workflow_state} />
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">
                          v{f.policy_version}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-slate-400 truncate">{f.role_arn}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canRollback && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRollbackTarget(f); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
                        >
                          <RotateCcw size={12} /> Rollback
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/roles/${encodeURIComponent(f.role_id)}?scan_id=${f.scan_id}`); }}
                        className="text-slate-400 hover:text-sky-600 transition-colors"
                        title="View role detail"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Summary row */}
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400">Current Version</p>
                      <p className="font-mono font-semibold text-slate-700">v{f.policy_version}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">History Entries</p>
                      <p className="font-semibold text-slate-700">{f.policy_history.length}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Applied At</p>
                      <p className="text-slate-600">
                        {f.applied_at
                          ? new Date(f.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Expanded version history */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Version History</p>
                    <VersionHistory entries={f.policy_history} />

                    {/* Applied policy summary */}
                    {f.reviewed_by && (
                      <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 space-y-1">
                        <p><strong>Reviewed by:</strong> {f.reviewed_by}</p>
                        {f.review_notes && <p><strong>Notes:</strong> {f.review_notes}</p>}
                        {f.reviewed_at && (
                          <p><strong>Reviewed:</strong> {new Date(f.reviewed_at).toLocaleString()}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
