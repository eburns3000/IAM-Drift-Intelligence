import { useEffect, useState } from 'react';
import { FileText, RefreshCw, Sparkles, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { reportsApi, scansApi } from '../services/api';
import { IamScan } from '../types';
import { Card, CardHeader } from '../components/ui/Card';
import { healthScoreColor } from '../components/ui/Badge';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function MarkdownSection({ content }: { content: string }) {
  // Split on markdown headers and render them
  const lines = content.split('\n');
  return (
    <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h2 key={i} className="text-base font-bold text-slate-900 mt-5 mb-2 first:mt-0">{line.slice(3)}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={i} className="text-lg font-bold text-slate-900 mb-3">{line.slice(2)}</h1>;
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-semibold text-slate-800">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex items-start gap-2 ml-2">
              <span className="text-sky-500 mt-1 flex-shrink-0">•</span>
              <span className="text-slate-600">{line.slice(2)}</span>
            </div>
          );
        }
        if (line.startsWith('---')) {
          return <hr key={i} className="border-slate-200 my-4" />;
        }
        if (line.trim() === '') {
          return <div key={i} className="h-1" />;
        }
        // Bold inline text
        const parts = line.split(/\*\*(.*?)\*\*/g);
        if (parts.length > 1) {
          return (
            <p key={i} className="text-slate-600">
              {parts.map((part, j) =>
                j % 2 === 1 ? <strong key={j} className="text-slate-800">{part}</strong> : part
              )}
            </p>
          );
        }
        return <p key={i} className="text-slate-600">{line}</p>;
      })}
    </div>
  );
}

export default function ExecutiveReport() {
  const [report, setReport] = useState<IamScan | null>(null);
  const [scans, setScans] = useState<IamScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [latest, allScans] = await Promise.all([
          reportsApi.getLatest(),
          scansApi.list(),
        ]);
        setReport(latest);
        setScans(allScans.slice(0, 5));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleGenerate(scanId?: string) {
    setGenerating(true);
    setError(null);
    try {
      const result = await reportsApi.generate(scanId);
      setReport(result);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw size={20} className="animate-spin" /> Loading reports...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Success banner */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 flex items-center gap-2 text-emerald-700 text-sm font-medium">
          <CheckCircle2 size={16} /> Report generated successfully
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Generation controls */}
      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-2">
          <CardHeader
            title="Generate Executive Report"
            subtitle="AI-powered governance summary for leadership review"
            action={
              <button
                onClick={() => handleGenerate()}
                disabled={generating}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  generating
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm'
                }`}
              >
                {generating ? (
                  <><RefreshCw size={14} className="animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles size={14} /> Generate Report</>
                )}
              </button>
            }
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Report Includes</p>
              <ul className="space-y-1.5 text-sm text-slate-600">
                {[
                  'Portfolio IAM health score',
                  'Top risk findings summary',
                  'Remediation progress metrics',
                  'Risk trend analysis',
                  'Strategic recommendations',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Generate for Scan</p>
              <div className="space-y-2">
                {scans.map((s) => (
                  <button
                    key={s.scan_id}
                    onClick={() => handleGenerate(s.scan_id)}
                    disabled={generating}
                    className="w-full text-left flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50 transition-all text-xs disabled:opacity-50"
                  >
                    <div>
                      <p className="font-mono text-slate-600 truncate">{s.scan_id.slice(-24)}</p>
                      <p className="text-slate-400 mt-0.5">{formatDate(s.scan_started_at).split(',')[0]}</p>
                    </div>
                    <span className={`font-bold ${healthScoreColor(s.health_score)}`}>
                      {s.health_score}/100
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Metadata sidebar */}
        <Card>
          <CardHeader title="Report Status" />
          {report?.report_generated_at ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 size={16} />
                <span className="text-sm font-medium">Report available</span>
              </div>
              <div className="text-xs text-slate-500 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Clock size={12} />
                  <span>{formatDate(report.report_generated_at)}</span>
                </div>
                <div>
                  <span className="font-medium">Scan:</span> {report.scan_id.slice(-20)}
                </div>
                <div>
                  <span className="font-medium">Health Score:</span>{' '}
                  <span className={`font-bold ${healthScoreColor(report.health_score)}`}>
                    {report.health_score}/100
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400">
              <FileText size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No report yet</p>
              <p className="text-xs mt-1">Click Generate Report to create one</p>
            </div>
          )}
        </Card>
      </div>

      {/* Report content */}
      {report?.executive_report && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Executive Report</h3>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <Clock size={11} /> Generated {formatDate(report.report_generated_at)}
              </p>
            </div>
            <div className={`text-2xl font-bold ${healthScoreColor(report.health_score)}`}>
              {report.health_score}/100
            </div>
          </div>
          <div className="border-t border-slate-100 pt-5">
            <MarkdownSection content={report.executive_report} />
          </div>
        </Card>
      )}

      {generating && !report?.executive_report && (
        <Card>
          <div className="flex items-center justify-center py-16">
            <div className="text-center text-slate-400">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Sparkles size={20} className="text-sky-500 animate-pulse" />
                <RefreshCw size={18} className="animate-spin" />
              </div>
              <p className="font-medium text-slate-600">Generating executive report...</p>
              <p className="text-sm mt-1">Claude is analyzing your IAM posture. This takes 15–30 seconds.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
