import { RiskLevel, WorkflowState, SimulationResult, AIStatus, SimulationStatus } from '../../types';

// ─── Risk Level Badge ─────────────────────────────────────────────────────────

const riskColors: Record<RiskLevel, string> = {
  CRITICAL: 'bg-red-100 text-red-800 ring-1 ring-red-200',
  HIGH: 'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
  MEDIUM: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  LOW: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${riskColors[level]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        level === 'CRITICAL' ? 'bg-red-600' :
        level === 'HIGH' ? 'bg-orange-600' :
        level === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-600'
      }`} />
      {level}
    </span>
  );
}

// ─── Health Score Color ───────────────────────────────────────────────────────

export function healthScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-600';
}

export function healthScoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

// ─── Workflow State Badge ─────────────────────────────────────────────────────

const workflowLabels: Record<WorkflowState, string> = {
  scan_requested: 'Scan Requested',
  scanning: 'Scanning',
  deterministic_complete: 'Analysis Complete',
  ai_enrichment_in_progress: 'AI Enriching',
  simulation_complete: 'Simulation Complete',
  ready_for_review: 'Ready for Review',
  approved: 'Approved',
  rejected: 'Rejected',
  applied: 'Applied',
  rolled_back: 'Rolled Back',
};

const workflowColors: Record<WorkflowState, string> = {
  scan_requested: 'bg-slate-100 text-slate-600',
  scanning: 'bg-blue-100 text-blue-700',
  deterministic_complete: 'bg-sky-100 text-sky-700',
  ai_enrichment_in_progress: 'bg-violet-100 text-violet-700',
  simulation_complete: 'bg-indigo-100 text-indigo-700',
  ready_for_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  applied: 'bg-teal-100 text-teal-700',
  rolled_back: 'bg-orange-100 text-orange-700',
};

export function WorkflowBadge({ state }: { state: WorkflowState }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${workflowColors[state]}`}>
      {workflowLabels[state]}
    </span>
  );
}

// ─── Simulation Result Badge ──────────────────────────────────────────────────

export function SimulationResultBadge({ result }: { result: SimulationResult | null }) {
  if (!result) return null;
  const colors = {
    PASS: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
    PARTIAL: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    FAIL: 'bg-red-100 text-red-800 ring-1 ring-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[result]}`}>
      Sim: {result}
    </span>
  );
}

// ─── AI Status Badge ──────────────────────────────────────────────────────────

export function AIStatusBadge({ status }: { status: AIStatus }) {
  const config = {
    PENDING: { label: 'AI Pending', cls: 'bg-slate-100 text-slate-600' },
    IN_PROGRESS: { label: 'AI Running', cls: 'bg-violet-100 text-violet-700' },
    COMPLETE: { label: 'AI Complete', cls: 'bg-emerald-100 text-emerald-700' },
    FAILED: { label: 'AI Failed', cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = config[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Simulation Status Badge ──────────────────────────────────────────────────

export function SimStatusBadge({ status }: { status: SimulationStatus }) {
  const config = {
    PENDING: { label: 'Sim Pending', cls: 'bg-slate-100 text-slate-600' },
    IN_PROGRESS: { label: 'Simulating', cls: 'bg-indigo-100 text-indigo-700' },
    COMPLETE: { label: 'Sim Complete', cls: 'bg-emerald-100 text-emerald-700' },
    FAILED: { label: 'Sim Failed', cls: 'bg-red-100 text-red-700' },
    SKIPPED: { label: 'Sim Skipped', cls: 'bg-slate-100 text-slate-500' },
  };
  const { label, cls } = config[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Generic Badge ────────────────────────────────────────────────────────────

type BadgeColor = 'default' | 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'slate';

const genericColors: Record<BadgeColor, string> = {
  default: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  purple: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  slate: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

export function Badge({ children, color = 'default' }: { children: React.ReactNode; color?: BadgeColor }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${genericColors[color]}`}>
      {children}
    </span>
  );
}
