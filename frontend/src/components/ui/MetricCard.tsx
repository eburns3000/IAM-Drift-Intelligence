import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  color?: 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'slate';
  trend?: { value: string; up: boolean };
}

const colorMap = {
  blue: { icon: 'text-blue-600', bg: 'bg-blue-50' },
  emerald: { icon: 'text-emerald-600', bg: 'bg-emerald-50' },
  amber: { icon: 'text-amber-600', bg: 'bg-amber-50' },
  red: { icon: 'text-red-600', bg: 'bg-red-50' },
  purple: { icon: 'text-purple-600', bg: 'bg-purple-50' },
  slate: { icon: 'text-slate-600', bg: 'bg-slate-100' },
};

export function MetricCard({ label, value, subtext, icon: Icon, color = 'blue', trend }: MetricCardProps) {
  const { icon: iconCls, bg } = colorMap[color];
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
          {trend && (
            <p className={`text-xs font-medium mt-1 ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend.up ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <div className={`p-2.5 rounded-lg ${bg} flex-shrink-0`}>
          <Icon size={20} className={iconCls} />
        </div>
      </div>
    </div>
  );
}
