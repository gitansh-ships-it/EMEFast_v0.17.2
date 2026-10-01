"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Activity, ShieldCheck, RefreshCw, User, Filter } from 'lucide-react';
import api from '@/lib/api';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('ALL');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/audit-logs');
      setLogs(res.data || []);
    } catch {}
    finally { setLoading(false); }
  };

  const filteredLogs = filterAction === 'ALL'
    ? logs
    : logs.filter(l => l.action?.toLowerCase().includes(filterAction.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link href="/admin/dashboard" className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 mb-2">
            <ArrowLeft size={14} /> Back to Command Center
          </Link>
          <div className="eyebrow flex items-center gap-1.5 mb-1 text-purple-400 font-mono text-xs">
            <Activity size={13} /> Platform Provenance & Security Audit
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Audit Trail</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Immutable log of hospital verification workflows, resource mutations, and emergency decisions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-[#21262d] border border-neutral-700 text-neutral-200 text-xs rounded-xl px-3 py-2 focus:outline-none"
          >
            <option value="ALL">All Event Types</option>
            <option value="VERIFIED">Hospital Verifications</option>
            <option value="RESOURCE">Resource Updates</option>
            <option value="OVERRIDE">Manual Overrides</option>
            <option value="CASE">Emergency Cases</option>
          </select>

          <button
            onClick={fetchLogs}
            className="p-2 sm:px-3 sm:py-2 rounded-xl border border-[#30363d] bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] flex items-center gap-1.5 text-xs font-semibold transition-colors shrink-0 min-h-[40px]"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="v2-card p-5 space-y-3">
        {loading ? (
          <div className="py-12 text-center text-xs text-neutral-400 font-mono">Loading audit events…</div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400 font-mono">No audit log records found.</div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log: any, idx: number) => {
              const isOverride = log.action?.includes('OVERRIDE');
              const isResource = log.action?.includes('RESOURCE');
              const isVerify = log.action?.includes('VERIF') || log.action?.includes('SUSPEND');

              return (
                <div
                  key={log.id || idx}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs transition-all ${
                    isOverride ? 'bg-amber-950/20 border-amber-500/30' :
                    isResource ? 'bg-blue-950/20 border-blue-500/30' :
                    isVerify ? 'bg-emerald-950/20 border-emerald-500/30' :
                    'bg-neutral-900/50 border-neutral-800'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                        isOverride ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                        isResource ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                        isVerify ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                        'bg-white/10 text-neutral-300'
                      }`}>
                        {log.action}
                      </span>
                      {log.case_id && (
                        <span className="text-[10px] font-mono text-neutral-400">
                          Case #{log.case_id}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-neutral-500">
                        Actor: <strong className="text-neutral-300">{log.performed_by || 'SYSTEM'}</strong>
                      </span>
                    </div>
                    <p className="text-neutral-200 m-0 leading-relaxed font-sans">{log.details}</p>
                  </div>

                  <div className="shrink-0 text-left sm:text-right font-mono text-[10px] text-neutral-400">
                    <div className="flex items-center sm:justify-end gap-1">
                      <Clock size={11} />
                      <span>{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
