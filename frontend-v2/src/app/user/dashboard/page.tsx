"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  HeartPulse,
  Hospital as HospitalIcon,
  MapPin,
  Mic,
  Navigation,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap
} from 'lucide-react';
import api from '@/lib/api';
import { formatEnum, formatElapsedTime, formatDateTime } from '@/lib/format';
import { DecisionEngineResult, EmergencyCase } from '@/types';
import LiveMap from '@/components/LiveMap';

export default function UserDashboard() {
  const [activeCase, setActiveCase] = useState<EmergencyCase | null>(null);
  const [recentCases, setRecentCases] = useState<EmergencyCase[]>([]);
  const [decision, setDecision] = useState<DecisionEngineResult | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWaking, setIsWaking] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const RETRY_DELAYS = [5000, 15000, 30000];

  useEffect(() => {
    fetchData(false, 0);
    const interval = setInterval(() => {
      if (!error && !isWaking) {
        fetchData(false);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [error, isWaking]);

  const fetchData = async (isManualRetry = false, attempt = 0) => {
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
      const [activeRes, historyRes] = await Promise.all([
        api.get('/emergency/active/current', { signal: controller.signal }),
        api.get('/emergency/history/all', { signal: controller.signal }),
      ]);
      clearTimeout(timeoutId);
      setError(null);
      setIsWaking(false);
      setRetryAttempt(0);
      const active = activeRes.data as EmergencyCase | null;
      setActiveCase(active);
      setRecentCases((historyRes.data || []).slice(0, 6));
      if (active) {
        try {
          const rec = await api.get(`/emergency/${active.id}/recommendation`, { signal: controller.signal });
          setDecision(rec.data);
        } catch {
          setDecision(null);
        }
      } else {
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

  const accepted = decision?.accepted_count ?? activeCase?.responses?.filter(r => r.response === 'ACCEPTED').length ?? 0;
  const total = decision?.total_evaluated ?? activeCase?.responses?.length ?? 0;
  const declined = decision?.rejected_count ?? activeCase?.responses?.filter(r => r.response === 'REJECTED').length ?? 0;
  const recommended = decision?.recommended_hospital || null;

  return (
    <div className="dashboard-page max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 pt-[env(safe-area-inset-top,0px)] pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
      {/* HEADER SECTION */}
      <section className="dashboard-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-[var(--muted)]">
            <Radio size={13} className="text-red-500" /> Emergency Coordination Desk · Live
          </div>
          <h1 className="page-title">Ambulance Emergency Workspace</h1>
          <p className="page-subtitle mt-1">Active triage and multi-hospital response coordination</p>
        </div>
        <Link
          href="/ambulance/emergency/new"
          className="dashboard-primary w-full sm:w-auto min-h-[44px] justify-center text-center font-semibold"
        >
          <AlertTriangle size={16} /> New emergency <ArrowRight size={15} />
        </Link>
      </section>

      {/* ERROR STATE */}
      {error ? (
        <div className="glass-panel p-5 sm:p-8 my-6 sm:my-8 max-w-2xl mx-auto rounded-2xl sm:rounded-3xl border border-red-500/30 bg-gradient-to-b from-red-500/10 to-transparent text-center space-y-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto border border-red-500/30 shadow-[0_0_30px_rgba(255,59,48,0.2)]">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Hospital Network Connection Failed</h2>
          <p className="text-xs sm:text-sm text-neutral-300 max-w-md mx-auto leading-relaxed">{error}</p>
          <div className="pt-2">
            <button
              onClick={() => fetchData(true, 0)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#ff3b30] hover:bg-[#ff453a] text-white text-xs font-bold tracking-wider uppercase transition-all shadow-[0_8px_25px_rgba(255,59,48,0.35)] active:scale-95 cursor-pointer min-h-[44px] w-full sm:w-auto"
            >
              <RefreshCw size={15} /> Retry Connection
            </button>
          </div>
        </div>
      ) : loading || isWaking ? (
        /* LOADING SKELETON */
        <div className="skeleton-dashboard space-y-6 animate-pulse">
          {isWaking ? (
            <div className="glass-panel p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                  <Radio className="spin" size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-200 text-sm">Waking up the response network — this can take up to a minute on first load</h3>
                  <p className="text-neutral-400 text-xs mt-0.5">Render free tier spins down after inactivity. Automatic retry attempt {retryAttempt}/3 in progress…</p>
                </div>
              </div>
              <button
                onClick={() => fetchData(true, 0)}
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors text-xs min-h-[36px] w-full sm:w-auto"
              >
                Force Retry
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-xs text-[var(--muted)] py-1">
              <Radio className="spin text-[#ff3b30]" size={15} />
              <span>Connecting to hospital response network…</span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="glass-panel p-4 sm:p-5 rounded-2xl space-y-2.5 sm:space-y-3 bg-white/[0.02]">
                <div className="h-3 w-16 sm:w-20 bg-white/10 rounded-full" />
                <div className="h-6 sm:h-7 w-24 sm:w-28 bg-white/15 rounded-lg" />
                <div className="h-3 w-28 sm:w-32 bg-white/5 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : activeCase ? (
        /* ACTIVE CASE WORKSPACE */
        <div className="space-y-6">
          {/* 1. HERO: Case Code, Vitals Summary, Urgency Tier, Elapsed Time, Audio Player */}
          <article className="dashboard-case-card glass-panel p-5 sm:p-6 space-y-4">
            <div className="case-topline flex flex-wrap items-center justify-between gap-3">
              <div className="case-title-wrap flex flex-wrap items-center gap-2">
                <span className="live-badge"><span /> LIVE CASE</span>
                <span className="case-code font-mono font-bold text-[var(--text)]">{activeCase.case_code}</span>
                <span className={`severity-badge ${activeCase.priority === 'CRITICAL' ? 'critical' : ''}`}>
                  {formatEnum(activeCase.priority)}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-[var(--muted)]">
                  <Clock3 size={12} /> {formatElapsedTime(activeCase.created_at)}
                </span>
              </div>
              <span className="case-status text-xs font-mono font-bold px-3 py-1 rounded-full border border-white/10 bg-white/5">
                {formatEnum(activeCase.status)}
              </span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[var(--text)]">
                {activeCase.patient_name}
                {activeCase.patient_age ? <span className="text-sm font-normal text-[var(--muted)]"> · {activeCase.patient_age} yrs</span> : null}
                <span className="text-[var(--muted)] font-normal"> · {activeCase.condition}</span>
              </h2>
              <div className="case-meta flex flex-wrap items-center gap-3 sm:gap-4 mt-2 text-xs text-[var(--muted)]">
                <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#30d158]" /> {activeCase.requirements || 'Emergency stabilization'}</span>
                <span className="flex items-center gap-1.5"><Navigation size={14} className="text-[#2997ff]" /> {formatEnum(activeCase.transport_mode)}</span>
                {activeCase.address && <span className="flex items-center gap-1.5"><MapPin size={14} className="text-neutral-400" /> {activeCase.address}</span>}
              </div>
            </div>

            {/* Vitals Summary Strip */}
            <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <HeartPulse size={16} className="text-[#ff3b30] shrink-0" />
                <span className="font-semibold text-[var(--text)]">Patient Vitals:</span>
                <span className="text-[var(--muted)]">{activeCase.vitals || 'No vitals recorded'}</span>
              </div>
              {activeCase.abha_id && (
                <div className="text-[11px] font-mono text-[var(--muted)] bg-white/5 px-2 py-0.5 rounded border border-white/5">
                  ABHA: {activeCase.abha_id}
                </div>
              )}
            </div>

            {/* Inline Audio Player if voice note exists */}
            {activeCase.voice_note_path && (
              <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-[var(--stroke)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
                    <Mic size={14} className="text-[#ff3b30]" /> Paramedic Voice Assessment
                  </span>
                  <span className="text-[10px] font-mono text-[var(--muted)]">Audio Memo</span>
                </div>
                <audio
                  controls
                  preload="none"
                  src={
                    activeCase.voice_note_path.startsWith('http')
                      ? activeCase.voice_note_path
                      : `${(api.defaults.baseURL || '').replace(/\/api$/, '')}${activeCase.voice_note_path}`
                  }
                  className="w-full h-8 accent-[#ff3b30]"
                />
                {activeCase.voice_transcript && (
                  <p className="text-[11px] text-[var(--muted)] italic pt-0.5">
                    "{activeCase.voice_transcript}"
                  </p>
                )}
              </div>
            )}
          </article>

          {/* 2. IMMEDIATE NEXT ACTION (ONE primary CTA reflecting canonical state) */}
          <div className="next-action-container glass-panel p-4 sm:p-5 rounded-2xl border border-[var(--stroke)] bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[10px] font-mono font-bold tracking-widest text-[var(--muted)] uppercase flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#ff3b30] animate-pulse" /> Immediate Next Action
              </div>
              <div className="text-sm font-semibold text-[var(--text)]">
                {activeCase.status === 'WAITING_FOR_RESPONSES' && 'Awaiting hospital evaluations and capacity match'}
                {activeCase.status === 'PARTIAL_RESPONSES' && `${accepted} verified hospital responses logged and ready for review`}
                {activeCase.status === 'HOSPITAL_ACCEPTED' && 'Hospital accepted — destination selection required'}
                {activeCase.status === 'HOSPITAL_SELECTED' && `Destination confirmed: ${activeCase.selected_hospital?.name || recommended?.hospital_name || 'Selected Hospital'}`}
                {activeCase.status === 'COMPLETED' && 'Patient care handover complete · Case closed'}
                {activeCase.status === 'CANCELLED' && 'Emergency broadcast cancelled'}
                {activeCase.status === 'BROADCASTING' && 'Broadcasting emergency details to regional trauma network'}
                {activeCase.status === 'DRAFT' && 'Emergency draft in progress'}
              </div>
            </div>

            <div className="shrink-0 w-full sm:w-auto">
              {activeCase.status === 'WAITING_FOR_RESPONSES' ? (
                <div className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs uppercase tracking-wider min-h-[44px] w-full sm:w-auto cursor-not-allowed">
                  <Radio className="animate-spin text-amber-400" size={16} />
                  Awaiting hospital responses ({accepted} / {total || '—'})
                </div>
              ) : activeCase.status === 'PARTIAL_RESPONSES' ? (
                <Link
                  href={`/user/hospitals?case_id=${activeCase.id}`}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#2997ff] hover:bg-[#0071e3] text-white font-bold text-xs uppercase tracking-wider min-h-[44px] w-full sm:w-auto transition-all shadow-[0_4px_16px_rgba(41,151,255,0.3)]"
                >
                  <HospitalIcon size={16} /> Review hospital responses ({accepted} / {total}) <ArrowRight size={15} />
                </Link>
              ) : activeCase.status === 'HOSPITAL_ACCEPTED' ? (
                <Link
                  href={`/user/hospitals?case_id=${activeCase.id}`}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#30d158] hover:bg-[#28c04e] text-white font-bold text-xs uppercase tracking-wider min-h-[44px] w-full sm:w-auto transition-all shadow-[0_4px_16px_rgba(48,209,88,0.3)]"
                >
                  <CheckCircle2 size={16} /> Select hospital <ArrowRight size={15} />
                </Link>
              ) : activeCase.status === 'HOSPITAL_SELECTED' ? (
                <Link
                  href={`/user/navigation?case_id=${activeCase.id}`}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#2997ff] hover:bg-[#0071e3] text-white font-bold text-xs uppercase tracking-wider min-h-[44px] w-full sm:w-auto transition-all shadow-[0_4px_16px_rgba(41,151,255,0.3)]"
                >
                  <Navigation size={16} /> Navigate to {activeCase.selected_hospital?.name || recommended?.hospital_name || 'Hospital'} <ArrowRight size={15} />
                </Link>
              ) : activeCase.status === 'COMPLETED' ? (
                <Link
                  href="/user/history"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-bold text-xs uppercase tracking-wider min-h-[44px] w-full sm:w-auto transition-all"
                >
                  <CheckCircle2 size={16} className="text-[#30d158]" /> Case closed · View summary <ArrowRight size={15} />
                </Link>
              ) : activeCase.status === 'CANCELLED' ? (
                <div className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 text-neutral-400 font-bold text-xs uppercase tracking-wider min-h-[44px] w-full sm:w-auto cursor-default">
                  <AlertTriangle size={16} className="text-neutral-500" /> Case cancelled
                </div>
              ) : (
                <div className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-300 font-bold text-xs uppercase tracking-wider min-h-[44px] w-full sm:w-auto">
                  <Radio className="animate-pulse text-[#ff3b30]" size={16} /> Processing emergency broadcast...
                </div>
              )}
            </div>
          </div>

          {/* 3. RESPONSES SUMMARY (Operational Counts: Queried, Accepted, Declined, Case Status) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="stat-card v2-card p-4 sm:p-5 border border-[var(--stroke)]">
              <span className="text-[11px] font-semibold text-[var(--muted)]">Case Status</span>
              <strong className="text-base sm:text-lg truncate text-[var(--text)] flex items-center gap-2 mt-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  activeCase.status === 'HOSPITAL_SELECTED' ? 'bg-[#2997ff]' :
                  activeCase.status === 'HOSPITAL_ACCEPTED' ? 'bg-[#30d158]' :
                  activeCase.status === 'WAITING_FOR_RESPONSES' ? 'bg-amber-400 animate-pulse' :
                  activeCase.status === 'COMPLETED' ? 'bg-neutral-400' : 'bg-[#ff3b30]'
                }`} />
                {formatEnum(activeCase.status)}
              </strong>
              <small className="text-[11px] text-[var(--muted)]">Canonical state machine</small>
            </div>

            <div className="stat-card v2-card p-4 sm:p-5 border border-[var(--stroke)]">
              <span className="text-[11px] font-semibold text-[var(--muted)]">Hospitals Queried</span>
              <strong className="text-xl sm:text-2xl font-bold tnum text-[var(--text)] mt-1">{total || '—'}</strong>
              <small className="text-[11px] text-[var(--muted)]">Verified regional facilities</small>
            </div>

            <div className="stat-card v2-card p-4 sm:p-5 border border-[var(--stroke)]">
              <span className="text-[11px] font-semibold text-[var(--muted)]">Accepted</span>
              <strong className="text-xl sm:text-2xl font-bold tnum text-[var(--text)] mt-1">{accepted}</strong>
              <small className="text-[11px] text-[var(--muted)]">{accepted > 0 ? `${accepted} facility acceptances` : 'Awaiting first response'}</small>
            </div>

            <div className="stat-card v2-card p-4 sm:p-5 border border-[var(--stroke)]">
              <span className="text-[11px] font-semibold text-[var(--muted)]">Declined</span>
              <strong className="text-xl sm:text-2xl font-bold tnum text-[var(--text)] mt-1">{declined}</strong>
              <small className="text-[11px] text-[var(--muted)]">At capacity or diverted</small>
            </div>
          </div>

          {/* 4. RECOMMENDED HOSPITAL PREVIEW (in HOSPITAL_ACCEPTED or HOSPITAL_SELECTED) */}
          {(activeCase.status === 'HOSPITAL_ACCEPTED' || activeCase.status === 'HOSPITAL_SELECTED') && recommended ? (
            <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-[#30d158]/35 bg-[#30d158]/[0.03] space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#30d158]/15 border border-[#30d158]/30 text-[#1e7e34] dark:text-[#30d158] text-[11px] font-bold font-mono">
                  <Zap size={12} className="fill-current" />
                  {activeCase.status === 'HOSPITAL_SELECTED' ? 'SELECTED DESTINATION' : 'RECOMMENDED DESTINATION'}
                </span>
                <span className="text-base sm:text-lg font-mono font-extrabold text-[#1e7e34] dark:text-[#30d158]">
                  {Math.round(recommended.eta)} MIN ETA · {recommended.distance_km.toFixed(1)} KM
                </span>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text)]">
                  {activeCase.selected_hospital?.name || recommended.hospital_name}
                </h2>
                <p className="text-xs sm:text-sm text-[var(--muted)] mt-1 font-medium">
                  {recommended.available_icu > 0 ? `${recommended.available_icu} ICU beds available` : 'ICU available'} · Verified Accepted · {recommended.distance_km.toFixed(1)} km · {Math.round(recommended.eta)} min transit
                </p>
              </div>

              {/* Expandable Why This Hospital */}
              <details className="group border border-[var(--stroke)] rounded-xl bg-white/[0.02] p-3.5 text-xs">
                <summary className="font-semibold text-[var(--text)] hover:opacity-80 cursor-pointer select-none flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[#1e7e34] dark:text-[#30d158]" /> Why this facility is recommended
                  </span>
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180 text-[var(--muted)]" />
                </summary>
                <div className="pt-3 mt-2 border-t border-[var(--stroke)] space-y-2 text-[var(--muted)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 text-[var(--text)]">
                      <CheckCircle2 size={13} className="text-[#1e7e34] dark:text-[#30d158] shrink-0" />
                      <span>Clinical capability for {activeCase.condition}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--text)]">
                      <CheckCircle2 size={13} className="text-[#1e7e34] dark:text-[#30d158] shrink-0" />
                      <span>Fastest transit route ({Math.round(recommended.eta)} min)</span>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--text)]">
                      <CheckCircle2 size={13} className="text-[#1e7e34] dark:text-[#30d158] shrink-0" />
                      <span>{recommended.available_icu} verified ICU beds standing by</span>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--text)]">
                      <CheckCircle2 size={13} className="text-[#1e7e34] dark:text-[#30d158] shrink-0" />
                      <span>Estimated cost: ₹{recommended.estimated_cost.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </details>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-white/5">
                <Link
                  href={`/user/hospitals?case_id=${activeCase.id}`}
                  className="text-xs font-bold text-[#2997ff] hover:underline flex items-center gap-1.5 min-h-[44px] sm:min-h-0"
                >
                  <HospitalIcon size={14} /> View all options →
                </Link>
                {activeCase.status !== 'HOSPITAL_SELECTED' && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Link
                      href={`/user/hospitals?case_id=${activeCase.id}`}
                      className="blue-button min-h-[44px] flex items-center justify-center w-full sm:w-auto"
                    >
                      <CheckCircle2 size={15} /> Select & Lock Destination
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-[#ff9f0a]">
                <Clock3 size={16} className="animate-spin" /> Hospital recommendation — waiting for responses
              </div>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Emergency broadcast sent to verified hospitals. Real-time recommendation will rank clinical fit, route ETA, and ICU availability once facilities accept.
              </p>
            </div>
          )}

          {/* 5. MAP: Live route / location map */}
          <article className="glass-panel dashboard-map-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow"><MapPin size={12} /> LIVE LOCATION & ROUTE</span>
                <h3>{activeCase.selected_hospital?.name || recommended?.hospital_name || 'Ambulance GPS Location'}</h3>
              </div>
              <span className="map-live-pill"><span /> GPS / MAP</span>
            </div>
            <LiveMap
              origin={{ lat: activeCase.latitude, lng: activeCase.longitude }}
              destination={
                activeCase.selected_hospital
                  ? { lat: activeCase.selected_hospital.latitude, lng: activeCase.selected_hospital.longitude }
                  : recommended
                  ? { lat: recommended.latitude, lng: recommended.longitude }
                  : null
              }
              destinationLabel={activeCase.selected_hospital?.name || recommended?.hospital_name || 'Hospital'}
              onRouteInfo={setRouteInfo}
            />
            <div className="map-footer">
              <span><span className="gps-dot" /> Live GPS telemetry from ambulance crew</span>
              <span>{routeInfo ? `${routeInfo.distanceKm.toFixed(1)} km · ${routeInfo.durationMin} min` : (activeCase.selected_hospital || recommended) ? 'Calculating transit route geometry...' : 'Route calculated upon facility selection'}</span>
            </div>
          </article>

          {/* 6. RECENT CASES DRAWER (in active case view) */}
          {recentCases.length > 0 && (
            <article className="glass-panel recent-panel">
              <div className="panel-heading">
                <h3>Recent emergency cases</h3>
                <Link href="/user/history">History →</Link>
              </div>
              <div className="recent-list">
                {recentCases.map(c => (
                  <Link key={c.id} href={`/user/hospitals?case_id=${c.id}`} className="recent-row">
                    <span className={`recent-severity ${c.priority === 'CRITICAL' ? 'critical' : ''}`} />
                    <div>
                      <strong>{c.case_code}</strong>
                      <span>{c.patient_name} · {formatEnum(c.status)}</span>
                    </div>
                    <ArrowRight size={14} />
                  </Link>
                ))}
              </div>
            </article>
          )}
        </div>
      ) : (
        /* EMPTY STATE WORKSPACE (No active emergency case) */
        <div className="space-y-6">
          <div className="glass-panel p-8 sm:p-12 rounded-3xl border border-white/10 bg-white/[0.02] text-center space-y-5 max-w-3xl mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-[#ff3b30] flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(255,59,48,0.15)]">
              <HeartPulse size={36} strokeWidth={2} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
                No Active Emergency Case
              </h2>
              <p className="text-sm text-[var(--muted)] max-w-lg mx-auto leading-relaxed">
                Emergency response channels and telemetry are standing by. Start a new case to broadcast patient details, clinical requirements, and vitals to verified regional hospitals.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/ambulance/emergency/new"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[#ff3b30] hover:bg-[#ff453a] text-white text-sm font-bold tracking-wide transition-all shadow-[0_8px_25px_rgba(255,59,48,0.35)] active:scale-95 cursor-pointer min-h-[48px]"
              >
                <AlertTriangle size={18} /> Start Emergency Case <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {/* RECENT CASES TABLE (in empty state: NO broken maps, NO empty stat cards, NO NaN values) */}
          {recentCases.length > 0 && (
            <article className="glass-panel p-5 sm:p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--text)]">Recent Emergency Cases</h3>
                  <p className="text-xs text-[var(--muted)]">Audit log of previously coordinated emergency cases</p>
                </div>
                <Link
                  href="/user/history"
                  className="text-xs font-bold text-[#2997ff] hover:underline flex items-center gap-1 min-h-[36px]"
                >
                  Full history <ArrowRight size={13} />
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--stroke)] text-[var(--muted)] font-mono text-[11px] uppercase tracking-wider">
                      <th className="pb-3 font-semibold">Case Code</th>
                      <th className="pb-3 font-semibold">Date / Time</th>
                      <th className="pb-3 font-semibold">Patient & Condition</th>
                      <th className="pb-3 font-semibold">Destination Hospital</th>
                      <th className="pb-3 font-semibold">Outcome</th>
                      <th className="pb-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--stroke)]">
                    {recentCases.slice(0, 5).map((c) => (
                      <tr key={c.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="py-3.5 font-mono font-bold text-[var(--text)]">
                          {c.case_code}
                        </td>
                        <td className="py-3.5 text-[var(--muted)] whitespace-nowrap">
                          {formatDateTime(c.created_at)}
                        </td>
                        <td className="py-3.5">
                          <div className="font-semibold text-[var(--text)]">{c.patient_name}</div>
                          <div className="text-[11px] text-[var(--muted)]">{c.condition}</div>
                        </td>
                        <td className="py-3.5 text-[var(--muted)]">
                          {c.selected_hospital?.name || '—'}
                        </td>
                        <td className="py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                            c.status === 'COMPLETED' ? 'bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/30' :
                            c.status === 'CANCELLED' ? 'bg-neutral-500/15 text-neutral-400 border border-neutral-500/30' :
                            c.status === 'HOSPITAL_SELECTED' ? 'bg-[#2997ff]/15 text-[#2997ff] border border-[#2997ff]/30' :
                            'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}>
                            {formatEnum(c.status)}
                          </span>
                        </td>
                        <td className="py-3.5 text-right whitespace-nowrap">
                          <Link
                            href={`/user/hospitals?case_id=${c.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--muted)] hover:text-white transition-colors"
                          >
                            Details <ArrowRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
