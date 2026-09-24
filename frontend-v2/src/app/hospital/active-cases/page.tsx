"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Clock, CheckCircle2, Radio, MapPin, XCircle, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { EmergencyCase } from '@/types';
import { formatEnum } from '@/lib/format';
import { getAuthSession } from '@/lib/auth';
import { useHospital } from '@/context/HospitalContext';

const RETRY_DELAYS = [5000, 15000, 30000];

export default function ActiveCasesPage() {
  const { setActiveCount } = useHospital();
  const [cases, setCases] = useState<EmergencyCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWaking, setIsWaking] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const fetchCases = async (isManualRetry = false, attempt = 0) => {
    if (isManualRetry) {
      setError(null);
      setIsWaking(false);
      setRetryAttempt(0);
      setLoading(true);
    }

    const session = getAuthSession();
    const hospId = session?.hospital_id;

    if (!hospId && session?.role !== 'ADMIN') {
      setError("Account Error: No hospital ID associated with this session token.");
      setLoading(false);
      return;
    }

    const targetId = hospId ?? 1; // Admins can monitor hospital 1 by default
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await api.get(`/hospitals/${targetId}/active-cases`, { signal: controller.signal });
      clearTimeout(timeoutId);
      setError(null);
      setIsWaking(false);
      setRetryAttempt(0);
      const list = res.data || [];
      setCases(list);
      setActiveCount(list.length);
    } catch (err: any) {
      clearTimeout(timeoutId);
      const status = err.response?.status;
      const detail = err.response?.data?.detail;

      if (status === 401) {
        setError("Session expired or unauthorized (401). Please sign in again.");
      } else if (status === 403) {
        setError(`Access forbidden (403): ${detail || "You do not have permission to view this facility's case stream."}`);
      } else {
        if (attempt < RETRY_DELAYS.length) {
          setIsWaking(true);
          const nextAttempt = attempt + 1;
          setRetryAttempt(nextAttempt);
          const delay = RETRY_DELAYS[attempt];
          setTimeout(() => {
            fetchCases(false, nextAttempt);
          }, delay);
          return;
        }
        setIsWaking(false);
        setError("Unable to connect to hospital response network within 8 seconds.");
      }
    } finally {
      clearTimeout(timeoutId);
      if (!isWaking) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCases();
    const interval = setInterval(() => {
      if (!error && !isWaking) {
        fetchCases();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [error, isWaking]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6 pb-[calc(76px+env(safe-area-inset-bottom,0px)+24px)]">
      <div>
        <div className="eyebrow flex items-center gap-1.5 mb-1.5 text-ok-400">
          <Activity size={13} /> Active Cases Monitor
        </div>
        <h1 className="page-title">Incoming Cases Stream</h1>
        <p className="page-subtitle mt-1">All cases currently in range of this ER facility</p>
      </div>

      {error ? (
        <div className="v2-card p-6 border border-sos-500/40 bg-sos-950/20 text-center space-y-3" role="alert">
          <div className="w-12 h-12 mx-auto rounded-full bg-sos-500/10 border border-sos-500/25 flex items-center justify-center text-sos-400">
            <XCircle size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Case Stream Connection Failed</h3>
            <p className="text-xs text-neutral-300 mt-1 max-w-md mx-auto">{error}</p>
          </div>
          <button
            onClick={() => fetchCases(true, 0)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#ff3b30] hover:bg-[#ff453a] text-white text-xs font-bold tracking-wider uppercase transition-all shadow-md active:scale-95 cursor-pointer mx-auto min-h-[44px]"
          >
            <RefreshCw size={14} /> Retry Stream
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
          {/* Active Case Stream Skeletons */}
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
                <div className="h-5 w-16 bg-neutral-700/20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : !error && cases.length === 0 ? (
        <div className="v2-card p-10 text-center space-y-2">
          <CheckCircle2 size={28} className="mx-auto text-ok-400" />
          <h3 className="text-sm font-bold text-white">No Active Cases</h3>
          <p className="text-xs text-[#6e7681]">Your ER intake queue is clear.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map(c => (
            <Link href={`/hospital/emergency/${c.id}`} key={c.id} className="v2-card v2-card-hover p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-4">
                <div className="min-w-[68px] px-2 h-10 rounded-lg bg-sos-400/10 border border-sos-400/25 text-sos-300 font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                  {c.case_code.split('-')[1] || c.id}
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-white">{c.patient_name}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${c.priority === 'CRITICAL' ? 'badge-red' : 'badge-amber'}`}>
                      {formatEnum(c.priority)}
                    </span>
                  </div>
                  <p className="text-xs text-sos-300">{c.condition}</p>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[#484f58]">
                    <Clock size={10} /> {new Date(c.created_at).toLocaleTimeString()}
                    <MapPin size={10} /> {c.address || (c.latitude ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}` : 'Coordinates pending')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="badge-amber text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                  {formatEnum(c.transport_mode)}
                </span>
                <span className="badge-subtle text-[10px] px-2 py-0.5 rounded font-mono">
                  {formatEnum(c.status)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
