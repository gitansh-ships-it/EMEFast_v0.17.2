"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, ChevronRight, AlertTriangle, RefreshCw, Radio } from 'lucide-react';
import api from '@/lib/api';
import { EmergencyCase } from '@/types';
import { formatEnum } from '@/lib/format';

const RETRY_DELAYS = [5000, 15000, 30000];

export default function HistoryPage() {
  const [cases, setCases] = useState<EmergencyCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWaking, setIsWaking] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const fetchHistory = async (isManualRetry = false, attempt = 0) => {
    if (isManualRetry) {
      setError(null);
      setIsWaking(false);
      setRetryAttempt(0);
      setLoading(true);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 8000);

    try {
      const res = await api.get('/emergency/history/all', { signal: controller.signal });
      clearTimeout(timeoutId);
      setError(null);
      setIsWaking(false);
      setRetryAttempt(0);
      setCases(res.data || []);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.response?.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('emefast_token');
          localStorage.removeItem('emefast_role');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        return;
      }
      if (attempt < RETRY_DELAYS.length) {
        setIsWaking(true);
        const nextAttempt = attempt + 1;
        setRetryAttempt(nextAttempt);
        const delay = RETRY_DELAYS[attempt];
        setTimeout(() => {
          fetchHistory(false, nextAttempt);
        }, delay);
        return;
      }

      setIsWaking(false);
      setError('Unable to connect to hospital response network within 8 seconds.');
    } finally {
      clearTimeout(timeoutId);
      if (!isWaking) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div>
        <div className="eyebrow flex items-center gap-1.5 mb-1.5">
          <Clock size={13} /> Case History
        </div>
        <h1 className="page-title">Emergency Case History</h1>
        <p className="page-subtitle mt-1">Complete record of all emergency cases</p>
      </div>

      {error ? (
        <div className="v2-card p-6 border border-sos-500/40 bg-sos-950/20 text-center space-y-3" role="alert">
          <div className="w-12 h-12 mx-auto rounded-full bg-sos-500/10 border border-sos-500/25 flex items-center justify-center text-sos-400">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Hospital Network Connection Failed</h3>
            <p className="text-xs text-neutral-300 mt-1 max-w-md mx-auto">{error}</p>
          </div>
          <button
            onClick={() => fetchHistory(true, 0)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#ff3b30] hover:bg-[#ff453a] text-white text-xs font-bold tracking-wider uppercase transition-all shadow-md active:scale-95 cursor-pointer mx-auto min-h-[44px]"
          >
            <RefreshCw size={14} /> Retry Connection
          </button>
        </div>
      ) : loading || isWaking ? (
        <div className="space-y-3">
          {isWaking && (
            <div className="flex items-center justify-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
              <Radio className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
              <span>Waking up the response network — this can take up to a minute on first load (attempt {retryAttempt}/{RETRY_DELAYS.length})</span>
            </div>
          )}
          {/* History Row Skeleton UI matching actual layout */}
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="v2-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="min-w-[68px] h-10 rounded-lg bg-neutral-700/30 shrink-0" />
                <div className="space-y-2">
                  <div className="h-4 w-36 bg-neutral-700/30 rounded" />
                  <div className="h-3 w-48 bg-neutral-700/20 rounded" />
                  <div className="h-3 w-32 bg-neutral-700/20 rounded" />
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="h-5 w-20 bg-neutral-700/30 rounded-full" />
                <div className="w-7 h-7 bg-neutral-700/20 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : cases.length === 0 ? (
        <div className="v2-card p-10 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 mx-auto text-neutral-500" />
          <p className="text-sm text-neutral-400">No emergency cases found.</p>
          <Link href="/ambulance/emergency/new" className="inline-flex items-center gap-1.5 py-2 px-5 rounded-full bg-[#ff3b30] text-white text-xs font-semibold min-h-[44px]">
            Create Emergency
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map(c => (
            <div key={c.id} className="v2-card v2-card-hover p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-4">
                <div className="min-w-[68px] px-2 h-10 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                  {c.case_code.split('-')[1] || c.id}
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-white">{c.patient_name}</h4>
                  <p className="text-xs text-[#8b949e]">{c.condition}</p>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[#484f58]">
                    <span>{formatEnum(c.transport_mode)}</span>
                    <span>·</span>
                    <span>{formatEnum(c.priority)}</span>
                    <span>·</span>
                    <span>{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  c.status === 'COMPLETED' ? 'badge-green' :
                  c.status === 'CANCELLED' ? 'badge-subtle' :
                  'badge-amber'
                }`}>
                  {formatEnum(c.status)}
                </span>
                {c.selected_hospital && (
                  <span className="text-[11px] text-[#6e7681] max-w-[120px] truncate hidden sm:block">→ {c.selected_hospital.name}</span>
                )}
                <Link href={`/user/hospitals?case_id=${c.id}`} className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] transition-colors" aria-label={`View hospital recommendation for case ${c.case_code}`}>
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
