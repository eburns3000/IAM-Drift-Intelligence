import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, ChevronRight,
  RefreshCw, ShieldCheck, Loader2, AlertCircle,
} from 'lucide-react';
import { findingsApi } from '../services/api';
import { IamFinding } from '../types';
import { RiskBadge, WorkflowBadge, SimulationResultBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';

// ─── Approve Modal ─────────────────────────────────────────────────────────────

function ApproveModal({
  finding,
  onConfirm,
  onCancel,
  loading,
}: {
  finding: IamFinding;
  onConfirm: (reviewedBy: string, notes: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reviewedBy, setReviewedBy] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Approve Remediation</h2>
          <p className="text-sm text-slate-500 mt-1">Review simulation results before confirming approval for <strong>{finding.role_name}</strong></p>
        </div>
        <div className="p-6 space-y-5">
          {/* Simulation result */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <span className="text-sm font-medium text-slate-600">Simulation Result:</span>
            <SimulationResultBadge result={finding.simulation_result} />
          </div>

          {/* Breaking changes warning */}
          {finding.simulation_breaking_changes.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-600" />
                <p className="text-sm font-semibold text-red-800">Breaking Changes Detected ({finding.simulation_breaking_changes.length})</p>
              </div>
              <p className="text-xs text-red-600 mb-2">These actions were observed in CloudTrail but will be removed by the proposed policy:</p>
              <div className="flex flex-wrap gap-1.5">
                {finding.simulation_breaking_changes.map((a) => (
                  <span key={a} className="font-mono text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Actions preserved */}
          {finding.simulation_actions_preserved.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">
                Actions Preserved ({finding.simulation_actions_preserved.length})
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {finding.simulation_actions_preserved.slice(0, 20).map((a) => (
                  <span key={a} className="font-mono text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100">{a}</span>
                ))}
                {finding.simulation_actions_preserved.length > 20 && (
                  <span className="text-xs text-slate-400">+{finding.simulation_actions_preserved.length - 20} more</span>
                )}
              </div>
            </div>
          )}

          {/* Actions removed */}
          {finding.simulation_actions_removed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                Actions Removed ({finding.simulation_actions_removed.length})
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {finding.simulation_actions_removed.slice(0, 20).map((a) => (
                  <span key={a} className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{a}</span>
                ))}
                {finding.simulation_actions_removed.length > 20 && (
                  <span className="text-xs text-slate-400">+{finding.simulation_actions_removed.length - 20} more</span>
                )}
              </div>
            </div>
          )}

          {/* Reviewer inputs */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Reviewed By *</label>
              <input
                type="text"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
                placeholder="your.name@company.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Review Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes about this approval..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reviewedBy, notes)}
            disabled={!reviewedBy || loading}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              !reviewedBy || loading
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Approving...</> : <><CheckCircle2 size={14} /> Approve</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reject Modal ──────────────────────────────────────────────────────────────

function RejectModal({
  finding,
  onConfirm,
  onCancel,
  loading,
}: {
  finding: IamFinding;
  onConfirm: (reviewedBy: string, notes: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reviewedBy, setReviewedBy] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Reject Remediation</h2>
          <p className="text-sm text-slate-500 mt-1">Reject the proposed policy for <strong>{finding.role_name}</strong></p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Reviewed By *</label>
            <input
              type="text"
              value={reviewedBy}
              onChange={(e) => setReviewedBy(e.target.value)}
              placeholder="your.name@company.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Reason for Rejection *</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Explain why this proposed policy is being rejected..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reviewedBy, notes)}
            disabled={!reviewedBy || !notes || loading}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              !reviewedBy || !notes || loading
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Rejecting...</> : <><XCircle size={14} /> Reject</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Finding Card ─────────────────────────────────────────────────────────────

function FindingCard({
  finding,
  onApprove,
  onReject,
}: {
  finding: IamFinding;
  onApprove: (f: IamFinding) => void;
  onReject: (f: IamFinding) => void;
}) {
  const navigate = useNavigate();

  const canApprove = finding.simulation_status === 'COMPLETE' && finding.ai_status === 'COMPLETE';

  const enrichmentState = () => {
    if (finding.ai_status === 'FAILED') return { label: 'AI Enrichment Failed', cls: 'text-red-600 bg-red-50', icon: <AlertCircle size={13} /> };
    if (finding.ai_status === 'PENDING' || finding.ai_status === 'IN_PROGRESS') return { label: 'AI analysis in progress...', cls: 'text-violet-600 bg-violet-50', icon: <Loader2 size={13} className="animate-spin" /> };
    if (finding.simulation_status === 'FAILED') return { label: 'Simulation Failed', cls: 'text-red-600 bg-red-50', icon: <AlertCircle size={13} /> };
    if (finding.simulation_status === 'PENDING' || finding.simulation_status === 'IN_PROGRESS') return { label: 'Simulating policy changes...', cls: 'text-indigo-600 bg-indigo-50', icon: <Loader2 size={13} className="animate-spin" /> };
    if (finding.simulation_status === 'COMPLETE') return { label: 'Ready for approval', cls: 'text-emerald-600 bg-emerald-50', icon: <ShieldCheck size={13} /> };
    if (finding.simulation_status === 'SKIPPED') return { label: 'Simulation skipped (AI failed)', cls: 'text-slate-500 bg-slate-50', icon: <AlertCircle size={13} /> };
    return { label: finding.workflow_state.replace(/_/g, ' '), cls: 'text-slate-600 bg-slate-50', icon: <Clock size={13} /> };
  };

  const state = enrichmentState();

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-900 truncate text-sm">{finding.role_name}</h3>
              <RiskBadge level={finding.risk_level} />
              <WorkflowBadge state={finding.workflow_state} />
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">{finding.role_arn}</p>
          </div>
          <button
            onClick={() => navigate(`/roles/${encodeURIComponent(finding.role_id)}?scan_id=${finding.scan_id}`)}
            className="ml-3 text-slate-400 hover:text-sky-600 transition-colors flex-shrink-0"
            title="View role detail"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Enrichment state indicator */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium mb-3 ${state.cls}`}>
          {state.icon}
          {state.label}
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <p className="text-lg font-bold text-slate-800">{finding.risk_score}</p>
            <p className="text-xs text-slate-400">Risk Score</p>
          </div>
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-center gap-1">
              <span className="text-sm font-bold text-red-500">{finding.permission_count_before}</span>
              <span className="text-slate-300">→</span>
              <span className="text-sm font-bold text-emerald-600">{finding.permission_count_after}</span>
            </div>
            <p className="text-xs text-slate-400">Permissions</p>
          </div>
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <p className="text-lg font-bold text-emerald-600">{finding.permission_reduction_pct}%</p>
            <p className="text-xs text-slate-400">Reduction</p>
          </div>
        </div>

        {/* Next action */}
        {finding.next_action_required && (
          <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
            <Clock size={11} /> {finding.next_action_required.replace(/_/g, ' ')}
          </p>
        )}

        {/* Error states */}
        {finding.ai_status === 'FAILED' && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-red-700 font-medium">AI enrichment failed — manual review required</p>
            <p className="text-xs text-red-500 mt-0.5">Cannot approve without a valid proposed policy</p>
          </div>
        )}
        {finding.simulation_status === 'FAILED' && finding.ai_status !== 'FAILED' && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-red-700 font-medium">Policy simulation failed</p>
            <p className="text-xs text-red-500 mt-0.5">Approve manually after reviewing the proposed policy</p>
          </div>
        )}

        {/* Approve / Reject buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onApprove(finding)}
            disabled={!canApprove}
            title={
              !canApprove
                ? finding.ai_status === 'FAILED'
                  ? 'Cannot approve — AI enrichment failed'
                  : finding.simulation_status === 'FAILED'
                  ? 'Cannot approve — simulation failed'
                  : `Simulation must complete first (${finding.simulation_status})`
                : 'Approve proposed policy'
            }
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              canApprove
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <CheckCircle2 size={13} />
            {finding.simulation_status === 'COMPLETE' ? 'Approve' : 'Approve (locked)'}
          </button>
          <button
            onClick={() => onReject(finding)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-700 transition-all"
          >
            <XCircle size={13} /> Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RemediationQueue() {
  const [findings, setFindings] = useState<IamFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<IamFinding | null>(null);
  const [rejectTarget, setRejectTarget] = useState<IamFinding | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await findingsApi.list({ review_decision: 'PENDING' });
      setFindings(data.sort((a, b) => b.risk_score - a.risk_score));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(reviewedBy: string, notes: string) {
    if (!approveTarget) return;
    setActionLoading(true);
    try {
      const updated = await findingsApi.approve(
        approveTarget.role_id, approveTarget.scan_id, reviewedBy, notes
      );
      setFindings((prev) => prev.filter((f) => f.role_id !== updated.role_id));
      setSuccessMsg(`✓ ${approveTarget.role_name} approved`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setActionLoading(false);
      setApproveTarget(null);
    }
  }

  async function handleReject(reviewedBy: string, notes: string) {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      const updated = await findingsApi.reject(
        rejectTarget.role_id, rejectTarget.scan_id, reviewedBy, notes
      );
      setFindings((prev) => prev.filter((f) => f.role_id !== updated.role_id));
      setSuccessMsg(`✓ ${rejectTarget.role_name} rejected`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setActionLoading(false);
      setRejectTarget(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw size={20} className="animate-spin" />
          <span>Loading remediation queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Modals */}
      {approveTarget && (
        <ApproveModal
          finding={approveTarget}
          onConfirm={handleApprove}
          onCancel={() => setApproveTarget(null)}
          loading={actionLoading}
        />
      )}
      {rejectTarget && (
        <RejectModal
          finding={rejectTarget}
          onConfirm={handleReject}
          onCancel={() => setRejectTarget(null)}
          loading={actionLoading}
        />
      )}

      {/* Status banners */}
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {findings.length} Finding{findings.length !== 1 ? 's' : ''} Pending Review
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Approve enables the Approve button only after simulation completes</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Findings grid */}
      {findings.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <CheckCircle2 size={40} className="mb-3 text-emerald-300" />
            <p className="font-semibold text-slate-600">Queue is empty</p>
            <p className="text-sm mt-1">All findings have been reviewed</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {findings.map((f) => (
            <FindingCard
              key={f.role_id}
              finding={f}
              onApprove={setApproveTarget}
              onReject={setRejectTarget}
            />
          ))}
        </div>
      )}
    </div>
  );
}
