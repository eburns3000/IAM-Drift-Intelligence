import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import ReactFlow, { Node, Edge, Background, Controls, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Search, RefreshCw, Copy, CheckCheck, AlertTriangle,
  Shield, ChevronLeft,
} from 'lucide-react';
import { findingsApi } from '../services/api';
import { IamFinding, PolicyDocument, RiskLevel } from '../types';
import { RiskBadge, WorkflowBadge, SimulationResultBadge, AIStatusBadge, SimStatusBadge } from '../components/ui/Badge';
import { Card, CardHeader } from '../components/ui/Card';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function policyJson(p: PolicyDocument): string {
  return JSON.stringify(p, null, 2);
}

const riskEdgeColor: Record<RiskLevel, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#10b981',
};

// ─── Policy Diff Viewer ────────────────────────────────────────────────────────

function PolicyDiff({ current, proposed }: { current: PolicyDocument; proposed: PolicyDocument }) {
  const [copied, setCopied] = useState<'current' | 'proposed' | null>(null);

  function copy(side: 'current' | 'proposed') {
    const text = policyJson(side === 'current' ? current : proposed);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(side);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {(['current', 'proposed'] as const).map((side) => {
        const policy = side === 'current' ? current : proposed;
        return (
          <div key={side} className="relative">
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg text-xs font-semibold ${
              side === 'current' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700 border-b border-emerald-100'
            }`}>
              <span>{side === 'current' ? 'Current Policy' : 'Proposed Policy (AI)'}</span>
              <button
                onClick={() => copy(side)}
                className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {copied === side ? <CheckCheck size={12} /> : <Copy size={12} />}
                {copied === side ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="bg-slate-900 text-slate-200 text-xs p-4 rounded-b-lg overflow-x-auto max-h-80 overflow-y-auto leading-relaxed">
              {policyJson(policy)}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

// ─── Blast Radius Graph ────────────────────────────────────────────────────────

function BlastRadiusGraph({ finding }: { finding: IamFinding }) {
  const { blast_radius } = finding;
  const services = blast_radius.reachable_services;
  const criticalPaths = new Set(blast_radius.critical_paths.map((p) => p.split(' ')[0]));

  const centerX = 300;
  const centerY = 200;
  const radius = 150;

  const initialNodes: Node[] = [
    {
      id: 'role',
      position: { x: centerX - 60, y: centerY - 20 },
      data: { label: finding.role_name },
      style: {
        background: '#0f172a',
        color: '#f8fafc',
        border: `2px solid ${riskEdgeColor[finding.risk_level]}`,
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        padding: '8px 12px',
        minWidth: 120,
      },
      type: 'default',
    },
    ...services.map((svc, i) => {
      const angle = (i / Math.max(services.length, 1)) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle) * (services.length <= 4 ? 1.2 : 1) - 40;
      const y = centerY + radius * Math.sin(angle) * (services.length <= 4 ? 1.2 : 1) - 15;
      const isCritical = criticalPaths.has(svc);
      return {
        id: svc,
        position: { x, y },
        data: { label: svc },
        style: {
          background: isCritical ? '#fef2f2' : '#f0fdf4',
          color: isCritical ? '#991b1b' : '#166534',
          border: `1.5px solid ${isCritical ? '#fecaca' : '#bbf7d0'}`,
          borderRadius: 6,
          fontSize: 11,
          padding: '4px 10px',
        },
        type: 'default',
      } as Node;
    }),
  ];

  const initialEdges: Edge[] = services.map((svc) => {
    const isCritical = criticalPaths.has(svc);
    return {
      id: `role-${svc}`,
      source: 'role',
      target: svc,
      style: {
        stroke: isCritical ? '#ef4444' : riskEdgeColor[finding.risk_level],
        strokeWidth: isCritical ? 2 : 1.5,
        strokeDasharray: isCritical ? '5,3' : undefined,
      },
      animated: isCritical,
    } as Edge;
  });

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  if (services.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm bg-slate-50 rounded-lg">
        <div className="text-center">
          <Shield size={24} className="mx-auto mb-2 text-slate-300" />
          <p>No reachable services in proposed policy</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ height: 360 }} className="rounded-lg overflow-hidden border border-slate-200">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          attributionPosition="bottom-left"
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
        </ReactFlow>
      </div>
      {blast_radius.critical_paths.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Critical Paths</p>
          {blast_radius.critical_paths.map((path, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              {path}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Role Selector ────────────────────────────────────────────────────────────

function RoleSelector({ onSelect }: { onSelect: (finding: IamFinding) => void }) {
  const [findings, setFindings] = useState<IamFinding[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    findingsApi.list()
      .then((data) => setFindings(data.sort((a, b) => b.risk_score - a.risk_score)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = findings.filter((f) =>
    f.role_name.toLowerCase().includes(query.toLowerCase()) ||
    f.role_arn.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Card>
      <CardHeader title="Select a Role" subtitle="Search for an IAM role to view its finding detail" />
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by role name or ARN..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-4">
          <RefreshCw size={16} className="animate-spin" /> Loading roles...
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filtered.map((f) => (
            <button
              key={f.role_id}
              onClick={() => onSelect(f)}
              className="w-full text-left flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50 transition-all group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-slate-800 truncate">{f.role_name}</span>
                  <RiskBadge level={f.risk_level} />
                </div>
                <p className="text-xs text-slate-400 font-mono truncate mt-0.5">{f.role_arn}</p>
              </div>
              <ChevronLeft size={14} className="text-slate-300 group-hover:text-sky-500 rotate-180 flex-shrink-0 ml-2" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No roles found</p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoleDetail() {
  const { roleId } = useParams<{ roleId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const scanId = searchParams.get('scan_id') ?? '';

  const [finding, setFinding] = useState<IamFinding | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadFinding = useCallback(async (rId: string, sId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await findingsApi.get(sId, rId);
      setFinding(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load finding');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (roleId && scanId) loadFinding(roleId, scanId);
  }, [roleId, scanId, loadFinding]);

  function handleSelect(f: IamFinding) {
    navigate(`/roles/${encodeURIComponent(f.role_id)}?scan_id=${f.scan_id}`);
    setFinding(f);
  }

  function copyTerraform() {
    if (!finding) return;
    navigator.clipboard.writeText(finding.terraform_export).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!roleId || !scanId) {
    return <RoleSelector onSelect={handleSelect} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw size={20} className="animate-spin" /> Loading role detail...
        </div>
      </div>
    );
  }

  if (error || !finding) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/roles')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-sky-600">
          <ChevronLeft size={16} /> Back to role search
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          <p className="font-semibold">Failed to load role</p>
          <p className="text-sm mt-1">{error ?? 'Role not found'}</p>
        </div>
      </div>
    );
  }

  const confidenceColor = finding.ai_confidence_score >= 0.8
    ? 'text-emerald-600'
    : finding.ai_confidence_score >= 0.6
    ? 'text-amber-600'
    : 'text-red-600';

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <button onClick={() => navigate('/roles')} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-sky-600 transition-colors">
        <ChevronLeft size={15} /> All Roles
      </button>

      {/* Role identity */}
      <Card>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h2 className="text-xl font-bold text-slate-900">{finding.role_name}</h2>
              <RiskBadge level={finding.risk_level} />
              <WorkflowBadge state={finding.workflow_state} />
              <AIStatusBadge status={finding.ai_status} />
              <SimStatusBadge status={finding.simulation_status} />
              {finding.simulation_result && <SimulationResultBadge result={finding.simulation_result} />}
            </div>
            <p className="font-mono text-xs text-slate-400 break-all">{finding.role_arn}</p>
          </div>
          <div className="text-right text-sm flex-shrink-0">
            <p className="text-2xl font-bold text-slate-900">{finding.risk_score}</p>
            <p className="text-xs text-slate-400">Risk Score</p>
            <p className="text-xs text-slate-400 mt-1">Last used: {formatDate(finding.last_used_date)}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-xs text-slate-400 mb-0.5">Account</p><p className="font-medium">{finding.account_id}</p></div>
          <div><p className="text-xs text-slate-400 mb-0.5">Permissions</p>
            <p className="font-medium">
              <span className="text-red-500">{finding.permission_count_before}</span>
              <span className="text-slate-300 mx-1">→</span>
              <span className="text-emerald-600">{finding.permission_count_after}</span>
              <span className="text-xs text-slate-400 ml-1">({finding.permission_reduction_pct}% reduction)</span>
            </p>
          </div>
          <div><p className="text-xs text-slate-400 mb-0.5">Wildcards</p><p className="font-medium text-red-500">{finding.wildcard_actions.length} actions</p></div>
          <div><p className="text-xs text-slate-400 mb-0.5">Unused Services</p><p className="font-medium text-amber-600">{finding.unused_services.length} services</p></div>
        </div>
      </Card>

      {/* Intent Gap */}
      {(finding.intent_summary || finding.intent_gap) && (
        <Card>
          <CardHeader title="Intent Gap Analysis" subtitle="AI-generated explanation of the permission gap" />
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Intended Use', value: finding.intent_summary, color: 'border-sky-200 bg-sky-50' },
              { label: 'Actual Permissions', value: finding.actual_permissions_summary, color: 'border-amber-200 bg-amber-50' },
              { label: 'Gap', value: finding.intent_gap, color: 'border-red-200 bg-red-50' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`border rounded-lg p-4 ${color}`}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
                <p className="text-sm text-slate-700 leading-relaxed">{value || '—'}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
            <span className="text-xs text-slate-400">AI Confidence:</span>
            <span className={`text-sm font-bold ${confidenceColor}`}>{Math.round(finding.ai_confidence_score * 100)}%</span>
            {finding.ai_confidence_note && (
              <span className="text-xs text-slate-400">— {finding.ai_confidence_note}</span>
            )}
          </div>
        </Card>
      )}

      {/* Abuse Scenario */}
      {finding.abuse_scenario && (
        <Card>
          <CardHeader title="Abuse Scenario" subtitle="How this over-privileged role could be exploited" />
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-lg">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800 leading-relaxed">{finding.abuse_scenario}</p>
          </div>
        </Card>
      )}

      {/* Blast Radius */}
      <Card>
        <CardHeader
          title="Blast Radius"
          subtitle="Services reachable under the proposed policy (post-remediation)"
        />
        <BlastRadiusGraph finding={finding} />
      </Card>

      {/* Simulation Results */}
      {finding.simulation_status === 'COMPLETE' && (
        <Card>
          <CardHeader title="Policy Simulation Results" subtitle="IAM Policy Simulator output for the proposed policy" />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
                Preserved ({finding.simulation_actions_preserved.length})
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {finding.simulation_actions_preserved.slice(0, 30).map((a) => (
                  <div key={a} className="font-mono text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">{a}</div>
                ))}
                {finding.simulation_actions_preserved.length === 0 && <p className="text-xs text-slate-400">None</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Removed ({finding.simulation_actions_removed.length})
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {finding.simulation_actions_removed.slice(0, 30).map((a) => (
                  <div key={a} className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded">{a}</div>
                ))}
                {finding.simulation_actions_removed.length === 0 && <p className="text-xs text-slate-400">None</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
                Breaking Changes ({finding.simulation_breaking_changes.length})
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {finding.simulation_breaking_changes.map((a) => (
                  <div key={a} className="font-mono text-xs text-red-700 bg-red-50 border border-red-100 px-2 py-1 rounded">{a}</div>
                ))}
                {finding.simulation_breaking_changes.length === 0 && (
                  <p className="text-xs text-emerald-600 font-medium">No breaking changes</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Policy Diff */}
      <Card>
        <CardHeader title="Policy Diff" subtitle="Current vs AI-generated proposed policy" />
        <PolicyDiff current={finding.current_policy} proposed={finding.proposed_policy} />
      </Card>

      {/* Terraform Export */}
      {finding.terraform_export && (
        <Card>
          <CardHeader
            title="Terraform Export"
            subtitle="Ready-to-apply HCL for the least-privilege policy"
            action={
              <button
                onClick={copyTerraform}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied ? <CheckCheck size={13} className="text-emerald-600" /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy HCL'}
              </button>
            }
          />
          <pre className="bg-slate-900 text-slate-200 text-xs p-4 rounded-lg overflow-x-auto leading-relaxed max-h-80 overflow-y-auto">
            {finding.terraform_export}
          </pre>
        </Card>
      )}
    </div>
  );
}
