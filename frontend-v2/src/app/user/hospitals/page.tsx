"use client";
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Radio, CheckCircle2, XCircle, Clock, Navigation, Shield,
  Hospital as HospitalIcon, MapPin, ArrowRight, AlertTriangle, Zap, RefreshCw
} from 'lucide-react';
import api from '@/lib/api';
import { EmergencyCase, DecisionEngineResult } from '@/types';

const RETRY_DELAYS = [5000, 15000, 30000];

export default function HospitalDiscoveryPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="v2-card p-6 h-36 animate-pulse bg-neutral-800/20" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="v2-card p-4 h-28 animate-pulse bg-neutral-800/20" />
          <div className="v2-card p-4 h-28 animate-pulse bg-neutral-800/20" />
          <div className="v2-card p-4 h-28 animate-pulse bg-neutral-800/20" />
        </div>
      </div>
    }>
      <HospitalDiscoveryInner />
    </Suspense>
  );
}

function HospitalDiscoveryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get('case_id');
  const [currentCase, setCurrentCase] = useState<EmergencyCase | null>(null);
  const [decision, setDecision] = useState<DecisionEngineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWaking, setIsWaking] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const fetchData = async (isManualRetry = false, attempt = 0) => {
    if (isManualRetry) {
      setError(null);
      setIsWaking(false);
      setRetryAttempt(0);
      setLoading(true);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      let targetId = caseIdParam || (typeof window !== 'undefined' ? localStorage.getItem('emefast_current_case_id') : null);
      let caseData: EmergencyCase | null = null;
      if (targetId) {
        try {
          const res = await api.get(`/emergency/${targetId}`, { signal: controller.signal });
          caseData = res.data;
        } catch (e: any) {
          if (controller.signal.aborted) throw e;
          if (typeof window !== 'undefined') localStorage.removeItem('emefast_current_case_id');
          try {
            const activeRes = await api.get('/emergency/active/current', { signal: controller.signal });
            caseData = activeRes.data;
          } catch (e2: any) {
            if (controller.signal.aborted) throw e2;
          }
        }
      } else {
        try {
          const activeRes = await api.get('/emergency/active/current', { signal: controller.signal });
          caseData = activeRes.data;
        } catch (e3: any) {
          if (controller.signal.aborted) throw e3;
        }
      }

      clearTimeout(timeoutId);
      setError(null);
      setIsWaking(false);
      setRetryAttempt(0);

      if (caseData) {
        setCurrentCase(caseData);
        if (typeof window !== 'undefined') localStorage.setItem('emefast_current_case_id', String(caseData.id));
        try {
          const recRes = await api.get(`/emergency/${caseData.id}/recommendation`);
          setDecision(recRes.data);
        } catch {}
      } else {
        setCurrentCase(null);
        setDecision(null);
      }
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
          fetchData(false, nextAttempt);
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
    fetchData();
    const interval = setInterval(() => {
      // Only poll when not in error or waking state
      if (!error && !isWaking) {
        fetchData();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [caseIdParam, error, isWaking]);

  const handleSelect = async (hospitalId: number) => {
    if (!currentCase) return;
    setSelecting(true);
    try {
      await api.post(`/emergency/${currentCase.id}/select-hospital`, { hospital_id: hospitalId });
      router.push(`/user/navigation?case_id=${currentCase.id}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to select hospital.');
    } finally { setSelecting(false); }
  };

  if (error) return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="v2-card p-6 border border-sos-500/40 bg-sos-950/20 text-center space-y-3" role="alert">
        <div className="w-12 h-12 mx-auto rounded-full bg-sos-500/10 border border-sos-500/25 flex items-center justify-center text-sos-400">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Hospital Network Connection Failed</h3>
          <p className="text-xs text-neutral-300 mt-1 max-w-md mx-auto">{error}</p>
        </div>
        <button
          onClick={() => fetchData(true, 0)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#ff3b30] hover:bg-[#ff453a] text-white text-xs font-bold tracking-wider uppercase transition-all shadow-md active:scale-95 cursor-pointer mx-auto min-h-[44px]"
        >
          <RefreshCw size={14} /> Retry Connection
        </button>
      </div>
    </div>
  );

  if ((loading || isWaking) && !currentCase) return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {isWaking && (
        <div className="flex items-center justify-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
          <Radio className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
          <span>Waking up the response network — this can take up to a minute on first load (attempt {retryAttempt}/{RETRY_DELAYS.length})</span>
        </div>
      )}
      {/* Case Header Skeleton */}
      <div className="v2-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
        <div className="space-y-2 w-2/3">
          <div className="h-4 w-40 bg-neutral-700/30 rounded" />
          <div className="h-5 w-64 bg-neutral-700/40 rounded" />
          <div className="h-3 w-52 bg-neutral-700/20 rounded" />
        </div>
        <div className="h-9 w-32 bg-neutral-700/30 rounded" />
      </div>

      {/* Recommended Hero Skeleton */}
      <div className="v2-card p-5 space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 bg-neutral-700/30 rounded-full" />
          <div className="h-6 w-24 bg-neutral-700/30 rounded" />
        </div>
        <div className="h-6 w-72 bg-neutral-700/40 rounded" />
        <div className="h-4 w-56 bg-neutral-700/20 rounded" />
      </div>

      {/* 3 Comparison Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="v2-card p-4 space-y-3 animate-pulse">
            <div className="h-4 w-24 bg-neutral-700/30 rounded" />
            <div className="h-5 w-40 bg-neutral-700/40 rounded" />
            <div className="h-4 w-32 bg-neutral-700/20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );

  if (!currentCase) return (
    <div className="p-12 text-center space-y-4 max-w-md mx-auto">
      <AlertTriangle className="w-10 h-10 mx-auto text-sos-400" />
      <h2 className="text-base font-bold text-white">No Active Emergency Found</h2>
      <p className="text-xs text-[#6e7681]">Create a new emergency case to start hospital discovery.</p>
      <Link href="/ambulance/emergency/new" className="inline-flex items-center justify-center py-2 px-5 rounded-full bg-[#ff3b30] text-white text-xs font-semibold min-h-[44px]">Create Emergency</Link>
    </div>
  );

  const recommended = decision?.recommended_hospital;
  const fastest = decision?.fastest_hospital;
  const cheapest = decision?.cheapest_hospital;

  return (
    <div className="hospital-discovery max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pt-[env(safe-area-inset-top,0px)] pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))]">
      {/* Case Header */}
      <div className="v2-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="badge-red px-2 py-0.5 rounded font-mono font-bold">{currentCase.case_code}</span>
            <span className="text-[#6e7681] font-mono">· {currentCase.transport_mode}</span>
            <span className="text-ok-400 font-mono flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-400 animate-pulse-dot inline-block" />
              Query Active
            </span>
          </div>
          <h1 className="text-base sm:text-lg font-bold text-white">
            {(() => {
              const pName = currentCase.patient_name || "Unknown Patient";
              let cond = currentCase.condition || "";
              if (cond.toLowerCase().startsWith(pName.toLowerCase())) {
                cond = cond.slice(pName.length).replace(/^[\s—–-]+/, "");
              }
              return (
                <>
                  {pName} — <span className="text-sos-300">{cond || "Emergency"}</span>
                </>
              );
            })()}
          </h1>
          <p className="text-xs text-[#6e7681]">
            Required: <strong className="text-[#8b949e]">{currentCase.requirements}</strong> · Priority: <span className="font-bold text-sos-300">{currentCase.priority}</span>
          </p>
        </div>
        <button onClick={() => fetchData(true, 0)} className="p-2 sm:px-3 sm:py-2 rounded border border-[#30363d] bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors shrink-0 min-h-[44px] w-full sm:w-auto">
          <RefreshCw size={13} /> Sync Responses
        </button>
      </div>

      {/* Recommended Hero */}
      {(currentCase.status === 'HOSPITAL_ACCEPTED' || currentCase.status === 'HOSPITAL_SELECTED') && recommended ? (
        <div className="v2-card p-4 sm:p-5 space-y-4 border border-sos-400/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d7261e] text-white text-xs font-semibold">
              <Zap size={12} className="fill-white" /> Recommended Best Overall Option
            </span>
            <span className="text-xl sm:text-2xl font-bold text-[var(--text)] tnum flex items-baseline gap-2">
              <span>{recommended.eta} <span className="text-xs text-[var(--muted)] font-normal">min ETA</span></span>
              <span className="ml-2 text-base sm:text-lg text-[var(--text)] font-semibold">₹{recommended.estimated_cost?.toLocaleString?.() || recommended.estimated_cost}</span>
            </span>
          </div>

          {(recommended.flag === "requirement not confirmed" || (recommended as any).requirement_unconfirmed || decision?.decision_summary?.toLowerCase().includes("requirement not confirmed")) && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5 font-semibold" role="alert">
              <AlertTriangle size={16} className="shrink-0 text-[#ff9f0a]" />
              <div>
                <strong className="block text-amber-200">Notice: requirement not confirmed</strong>
                <span className="text-amber-300/90 text-[11px]">Requested ICU beds unavailable across network. Recommended for immediate emergency stabilization.</span>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <HospitalIcon size={20} className="text-sos-300 shrink-0" />
                {recommended.hospital_name}
              </h2>
              <p className="text-xs text-[#8b949e] flex items-center gap-1.5 flex-wrap">
                <MapPin size={12} className="text-[#484f58]" />
                <span>{recommended.hospital_address}</span> · <strong>{recommended.distance_km} km away</strong>
              </p>
              <p className="text-xs font-semibold">
                {recommended.flag === "requirement not confirmed" || (recommended as any).requirement_unconfirmed ? (
                  <span className="text-amber-400">⚠ Emergency stabilization · requirement not confirmed</span>
                ) : (
                  <span className="text-ok-400">✓ Accepted by ER Desk · {recommended.available_icu} ICU beds available</span>
                )}
              </p>
            </div>
            <button
              onClick={() => handleSelect(recommended.hospital_id)}
              disabled={selecting}
              className="sos-btn select-hospital-btn flex items-center justify-center gap-2 px-5 py-3 text-sm shrink-0 min-h-[48px] w-full md:w-auto"
            >
              <Navigation size={15} />
              {selecting ? 'Selecting...' : 'SELECT HOSPITAL'}
              <ArrowRight size={15} />
            </button>
          </div>

          {recommended.explanation?.length > 0 && (
            <div className="p-3 rounded-lg bg-[#21262d] border border-[#30363d] text-xs text-[#8b949e] space-y-1.5">
              <div className="font-mono text-[10px] text-[#484f58] uppercase tracking-wider">Decision Explanation Factors</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {recommended.explanation.map((exp, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle2 size={11} className="text-ok-400 shrink-0" />
                    <span>{exp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-[#ff9f0a]">
            <Clock size={16} className="animate-spin" /> Hospital recommendation — waiting for responses
          </div>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Hospitals within range are reviewing the emergency request. Real-time recommendation will rank clinical fit, route ETA, and ICU availability once facilities accept.
          </p>
        </div>
      )}

      {(currentCase.status === 'HOSPITAL_ACCEPTED' || currentCase.status === 'HOSPITAL_SELECTED') && decision && recommended && (
        <div className="comparison-grid">
          {([
            { label: 'BEST OVERALL', item: recommended, tone: 'red', hint: 'Clinical fit + ETA + resources + cost' },
            { label: 'FASTEST', item: fastest, tone: 'blue', hint: 'Lowest route ETA among accepted feasible hospitals' },
            { label: 'LOWEST EST. COST', item: cheapest, tone: 'amber', hint: 'Lowest estimated emergency cost among accepted options' },
          ] as const).map(card => (
            <div key={card.label} className={`comparison-card ${card.tone}`}>
              <span>{card.label}</span>
              {card.item ? (
                <>
                  <strong>{card.item.hospital_name}</strong>
                  <div>
                    <b>{card.item.eta != null ? `${Math.round(card.item.eta)} min` : '—'}</b>
                    <b>{card.item.estimated_cost != null ? `₹${card.item.estimated_cost.toLocaleString()}` : '—'}</b>
                    <b>{card.item.distance_km != null ? `${card.item.distance_km.toFixed(1)} km` : '—'}</b>
                  </div>
                  <small>{card.hint}</small>
                </>
              ) : <><strong>Waiting for acceptance</strong><small>{card.hint}</small></>}
            </div>
          ))}
        </div>
      )}

      {/* All Options */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Radio size={14} className="text-sos-400" /> Hospital Responses
          </h3>
          <span className="text-xs font-mono text-[#6e7681]">
            {decision?.accepted_count || 0} Accepted · {decision?.rejected_count || 0} Rejected · {decision?.pending_count || 0} Pending · costs shown per hospital
          </span>
        </div>

        <div className="space-y-2">
          {decision?.all_options?.map(opt => (
            <div
              key={opt.hospital_id}
              className={`v2-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs transition-all ${
                opt.is_recommended ? 'border-sos-400/40' :
                opt.response === 'ACCEPTED' ? 'border-ok-400/20' :
                opt.response === 'REJECTED' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg mt-0.5 shrink-0 ${
                  opt.response === 'ACCEPTED' ? 'bg-ok-400/10 text-ok-400' :
                  opt.response === 'REJECTED' ? 'bg-sos-400/10 text-sos-300' :
                  'bg-[#21262d] text-[#6e7681]'
                }`}>
                  <HospitalIcon size={16} />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-white text-sm">{opt.hospital_name}</h4>
                    {opt.is_recommended && (
                      <span className="match-badge">BEST OVERALL</span>
                    )}
                    {(opt.flag === "requirement not confirmed" || (opt as any).requirement_unconfirmed) && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        requirement not confirmed
                      </span>
                    )}
                    {(opt.score ?? 0) > 0 && (
                      <span className="match-badge">{Math.round(opt.score!)} SCORE</span>
                    )}
                  </div>
                  <p className="text-[#6e7681]">{opt.hospital_address} · {opt.distance_km} km</p>
                  {opt.hospital_capabilities && (
                    <p className="font-mono text-[#484f58]">Specialties: <span className="text-[#8b949e]">{opt.hospital_capabilities}</span></p>
                  )}
                  {opt.rejection_reason && (
                    <p className="text-sos-300 font-semibold">Reason: {opt.rejection_reason}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-white/5">
                <div className="text-left sm:text-right">
                  <div className={`flex items-center gap-1 font-semibold font-mono text-xs ${
                    opt.response === 'ACCEPTED' ? 'text-ok-400' :
                    opt.response === 'REJECTED' ? 'text-sos-300' :
                    'text-warn-300'
                  }`}>
                    {opt.response === 'ACCEPTED' ? <><CheckCircle2 size={12} /> ACCEPTED ({opt.eta}m)</> :
                     opt.response === 'REJECTED' ? <><XCircle size={12} /> REJECTED</> :
                     <><Clock size={12} /> PENDING</>}
                  </div>
                  <span className="text-[10px] text-[#484f58] font-mono block">ICU: {opt.available_icu} · Est. cost: ₹{opt.estimated_cost?.toLocaleString?.() || opt.estimated_cost}</span>
                </div>
                {opt.response === 'ACCEPTED' && (
                  <button
                    onClick={() => handleSelect(opt.hospital_id)}
                    disabled={selecting}
                    className="py-2 px-4 rounded-full border border-[#30363d] bg-[#21262d] hover:bg-[#ff3b30] hover:border-[#ff3b30] hover:text-white text-[#8b949e] font-semibold text-xs flex items-center justify-center gap-1.5 transition-all min-h-[44px] w-full sm:w-auto active:scale-95 cursor-pointer"
                  >
                    Select <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
