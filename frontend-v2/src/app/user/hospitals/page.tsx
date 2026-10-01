"use client";
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Radio, CheckCircle2, XCircle, Clock, Navigation, Shield, ShieldCheck,
  Hospital as HospitalIcon, MapPin, ArrowRight, AlertTriangle, Zap, RefreshCw
} from 'lucide-react';
import api from '@/lib/api';
import { EmergencyCase, DecisionEngineResult } from '@/types';

const RETRY_DELAYS = [5000, 15000, 30000];

const INSURANCE_LABEL_MAP: Record<string, string> = {
  "RGHS": "RGHS",
  "PMJAY": "PM-JAY",
  "CGHS": "CGHS",
  "ECHS": "ECHS",
  "ESIC": "ESIC",
  "STAR_HEALTH": "Star Health",
  "HDFC_ERGO": "HDFC ERGO",
  "ICICI_LOMBARD": "ICICI Lombard",
  "CARE_HEALTH": "Care Health",
  "NIVA_BUPA": "Niva Bupa",
  "BAJAJ_ALLIANZ": "Bajaj Allianz",
  "TATA_AIG": "Tata AIG",
  "NEW_INDIA": "New India Assurance",
  "UNITED_INDIA": "United India",
  "NATIONAL": "National Insurance",
  "ORIENTAL": "Oriental Insurance",
  "CORPORATE_TIEUP": "Corporate Cashless",
  "CASH_ONLY": "Self-Pay / Cash",
};

const DEFAULT_HOSPITAL_INSURANCES: Record<string, string[]> = {
  "eternal": ["RGHS", "PMJAY", "STAR_HEALTH", "HDFC_ERGO", "ICICI_LOMBARD"],
  "fortis": ["RGHS", "PMJAY", "STAR_HEALTH", "CARE_HEALTH", "HDFC_ERGO"],
  "manipal": ["RGHS", "PMJAY", "STAR_HEALTH", "CARE_HEALTH", "ICICI_LOMBARD"],
  "rukmani": ["RGHS", "PMJAY", "STAR_HEALTH", "TATA_AIG", "HDFC_ERGO"],
  "narayana": ["RGHS", "PMJAY", "STAR_HEALTH", "NIVA_BUPA", "BAJAJ_ALLIANZ"],
  "sms": ["RGHS", "PMJAY", "CGHS", "ECHS", "ESIC"],
  "mahaveer": ["RGHS", "PMJAY", "STAR_HEALTH", "HDFC_ERGO"],
  "shalby": ["RGHS", "PMJAY", "STAR_HEALTH", "HDFC_ERGO"],
  "ck birla": ["RGHS", "PMJAY", "STAR_HEALTH", "ICICI_LOMBARD"],
  "rungta": ["RGHS", "PMJAY", "STAR_HEALTH", "CARE_HEALTH"],
  "apex": ["RGHS", "PMJAY", "STAR_HEALTH", "HDFC_ERGO"],
};

function getDisplayInsurances(hospitalName: string = '', insurances?: string[]): string[] {
  if (Array.isArray(insurances) && insurances.length > 0) {
    return insurances.map(c => INSURANCE_LABEL_MAP[c] || c);
  }
  const lower = String(hospitalName || '').toLowerCase();
  if (lower) {
    for (const [key, list] of Object.entries(DEFAULT_HOSPITAL_INSURANCES)) {
      if (lower.includes(key)) {
        return list.map(c => INSURANCE_LABEL_MAP[c] || c);
      }
    }
  }
  return ["RGHS", "PM-JAY", "Cashless Mediclaim"];
}

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
  const [hospitalMap, setHospitalMap] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWaking, setIsWaking] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'offline'>('connected');
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideHospital, setOverrideHospital] = useState<{ id: number; name: string } | null>(null);
  const [overrideReason, setOverrideReason] = useState('Patient or family preference');
  const [customReason, setCustomReason] = useState('');
  const [timeline, setTimeline] = useState<any[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);

  useEffect(() => {
    api.get('/hospitals').then(res => {
      const map: Record<number, any> = {};
      for (const h of (res.data || [])) {
        map[h.id] = h;
      }
      setHospitalMap(map);
    }).catch(() => {});
  }, []);

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
      setConnectionStatus('connected');
      setLastSyncedAt(new Date().toLocaleTimeString());

      if (caseData) {
        setCurrentCase(caseData);
        if (typeof window !== 'undefined') localStorage.setItem('emefast_current_case_id', String(caseData.id));
        try {
          const recRes = await api.get(`/emergency/${caseData.id}/recommendation`);
          setDecision(recRes.data);
        } catch {}

        try {
          const timeRes = await api.get(`/emergency/${caseData.id}/timeline`);
          setTimeline(timeRes.data || []);
        } catch {}
      } else {
        setCurrentCase(null);
        setDecision(null);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      setConnectionStatus(attempt >= 2 ? 'offline' : 'reconnecting');
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

  const handleSelect = async (hospitalId: number, explicitOverrideReason?: string) => {
    if (!currentCase) return;
    const isRecommended = decision?.recommended_hospital?.hospital_id === hospitalId;
    if (!isRecommended && !explicitOverrideReason) {
      const hObj = (decision?.all_options || []).find(o => o.hospital_id === hospitalId) || hospitalMap[hospitalId];
      setOverrideHospital({ id: hospitalId, name: hObj?.hospital_name || hObj?.name || `Hospital #${hospitalId}` });
      setOverrideModalOpen(true);
      return;
    }

    setSelecting(true);
    try {
      const payload: any = { hospital_id: hospitalId };
      if (explicitOverrideReason) {
        payload.override_reason = explicitOverrideReason;
      }
      await api.post(`/emergency/${currentCase.id}/select-hospital`, payload);
      setOverrideModalOpen(false);
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

  const optionsToRender = (decision?.all_options && decision.all_options.length > 0)
    ? decision.all_options.map(opt => {
        const hInfo = hospitalMap[opt.hospital_id];
        const respItem = (currentCase?.responses || []).find(r => r.hospital_id === opt.hospital_id);
        return {
          ...opt,
          hospital_name: opt.hospital_name || hInfo?.name || `Hospital #${opt.hospital_id}`,
          hospital_address: (opt.hospital_address && opt.hospital_address !== 'Nearby verified emergency facility')
            ? opt.hospital_address
            : (hInfo?.address || 'Nearby verified emergency facility'),
          supported_insurance: (opt.supported_insurance && opt.supported_insurance.length > 0)
            ? opt.supported_insurance
            : (hInfo?.supported_insurance || []),
          simulated: Boolean(opt.simulated ?? respItem?.simulated),
        };
      })
    : (currentCase?.responses || []).map(r => {
        const hInfo = hospitalMap[r.hospital_id];
        return {
          hospital_id: r.hospital_id,
          hospital_name: r.hospital_name || hInfo?.name || `Hospital #${r.hospital_id}`,
          hospital_address: (r as any).hospital_address || hInfo?.address || 'Nearby verified emergency facility',
          hospital_capabilities: (r as any).hospital_capabilities || hInfo?.capabilities || '',
          response: r.response,
          rejection_reason: r.rejection_reason,
          eta: r.eta || 0,
          distance_km: r.distance_km || 0,
          estimated_cost: r.estimated_cost || hInfo?.estimated_emergency_cost || 0,
          is_recommended: false,
          score: 0,
          explanation: [],
          available_beds: (r as any).available_beds || hInfo?.available_beds || 0,
          available_icu: (r as any).available_icu || hInfo?.available_icu || 0,
          flag: undefined,
          requirement_unconfirmed: false,
          supported_insurance: (r as any).supported_insurance || hInfo?.supported_insurance || [],
          simulated: Boolean(r.simulated),
          is_stale: false,
          primary_exclusion: undefined,
          why_not: undefined,
          why_this: undefined,
        };
      });

  const acceptedCount = decision?.accepted_count ?? (currentCase?.responses?.filter(r => r.response === 'ACCEPTED').length || 0);
  const rejectedCount = decision?.rejected_count ?? (currentCase?.responses?.filter(r => r.response === 'REJECTED').length || 0);
  const pendingCount = decision?.pending_count ?? (currentCase?.responses?.filter(r => r.response === 'PENDING').length || (currentCase?.responses?.length || 0));

  const totalContacted = currentCase.hospitals_contacted ?? (currentCase.responses?.length || 0);

  return (
    <div className="hospital-discovery max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))]">
      {/* Zero hospitals in range alert */}
      {totalContacted === 0 && (
        <aside role="alert" className="w-full bg-red-950/40 border-2 border-[#ff3b30] text-white p-6 rounded-2xl text-center space-y-3 shadow-xl">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#ff3b30]/20 border border-[#ff3b30]/40 flex items-center justify-center text-[#ff3b30]">
            <AlertTriangle size={26} />
          </div>
          <h2 className="text-lg font-bold text-white">
            No verified hospital within 25 km of this location. Call 108 / 112.
          </h2>
          <p className="text-xs text-neutral-300 max-w-lg mx-auto">
            Emergency broadcast found no participating verified facilities within the 25 km operating radius. Contact statutory emergency services immediately:
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <a
              href="tel:108"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#ff3b30] hover:bg-[#ff453a] text-white text-sm font-bold shadow-lg transition-transform active:scale-95"
            >
              📞 Call 108
            </a>
            <a
              href="tel:112"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white text-sm font-bold shadow-lg transition-transform active:scale-95"
            >
              📞 Call 112
            </a>
          </div>
        </aside>
      )}

      {/* Real-time Connection Status Banner */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-[#30d158] animate-pulse' :
            connectionStatus === 'reconnecting' ? 'bg-[#ff9f0a] animate-ping' :
            'bg-red-500'
          }`} />
          <span className="text-[var(--text)] font-semibold">
            {connectionStatus === 'connected' ? `Live Network Synced (${lastSyncedAt || 'active'})` :
             connectionStatus === 'reconnecting' ? `Reconnecting to hospital responses… (attempt ${retryAttempt})` :
             `REAL-TIME CONNECTION LOST`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2 flex items-center gap-1 cursor-pointer"
          >
            <Clock size={11} /> {showTimeline ? 'Hide Incident Timeline' : 'View Incident Timeline'}
          </button>
        </div>
      </div>

      {/* Incident Event Timeline (Expandable) */}
      {showTimeline && (
        <section className="v2-card p-4 space-y-3 border border-blue-500/30 bg-blue-950/10 animate-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <Clock size={13} className="text-blue-400" /> Permanent Incident Event Log · {currentCase.case_code}
            </h3>
            <span className="text-[10px] text-[var(--muted)] font-mono">{timeline.length} events recorded</span>
          </div>
          {timeline.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No audit events logged yet for this emergency case.</p>
          ) : (
            <div className="space-y-2 border-l-2 border-blue-500/30 pl-3 ml-1">
              {timeline.map((evt: any, i: number) => (
                <div key={evt.id || i} className="text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-blue-300 font-bold">{evt.action}</span>
                    <span className="text-[10px] text-[var(--muted)] font-mono">
                      {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : '—'}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">[{evt.performed_by || 'SYSTEM'}]</span>
                  </div>
                  <p className="text-[11px] text-neutral-300 m-0">{evt.details}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Prominent Decision-Support Boundary Notice */}
      <aside aria-label="Emergency Services Notice" className="w-full bg-amber-500/15 border border-amber-500/30 text-amber-200 p-2.5 rounded-2xl text-center text-xs font-medium">
        <span>Decision-support only. EMEFast does not dispatch ambulances. 108 / 112 remain the official emergency numbers.</span>
      </aside>

      {/* Case Header */}
      <div className="v2-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="badge-red px-2 py-0.5 rounded font-mono font-bold">{currentCase.case_code}</span>
            <span className="text-[#6e7681] font-mono">· {currentCase.transport_mode}</span>
            <span className="text-ok-400 font-mono flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-400 animate-pulse-dot inline-block" />
              Request Active
            </span>
          </div>
          <h1 className="text-base sm:text-lg font-bold text-white">
            {(() => {
              const pName = currentCase.patient_name || "Unknown Patient";
              let cond = currentCase.condition || "";
              if (cond.toLowerCase().startsWith(pName.toLowerCase())) {
                cond = cond.slice(pName.length).replace(/^[\s—–-]+/, "");
              }
              if (currentCase.voice_transcript && cond.trim() === currentCase.voice_transcript.trim()) {
                cond = currentCase.requirements || "Emergency Stabilization";
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

      {/* Diagnostic Boundary Notice */}
      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
        <span>Emergency coordination and hospital matching. Not a medical diagnosis system.</span>
        <span className="text-[10px] text-blue-300 font-mono">Admin-verified: Confirmed in administrative registry</span>
      </div>

      {/* Recommended Hero */}
      {(currentCase.status === 'HOSPITAL_ACCEPTED' || currentCase.status === 'HOSPITAL_SELECTED') && recommended ? (
        <div className="v2-card p-4 sm:p-5 space-y-4 border border-sos-400/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d7261e] text-white text-xs font-semibold">
                <Zap size={12} className="fill-white" /> Recommended Best Overall Option
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                MATCH CONFIDENCE: {recommended.confidence || 'HIGH'}
              </span>
              {Boolean(recommended.is_stale) && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  RESOURCE DATA STALE
                </span>
              )}
            </div>
            <span className="text-xl sm:text-2xl font-bold text-[var(--text)] tnum flex items-baseline gap-2">
              <span>{recommended.eta} <span className="text-xs text-[var(--muted)] font-normal">min ETA</span></span>
              <span className="ml-2 text-base sm:text-lg text-[var(--text)] font-semibold">₹{recommended.estimated_cost?.toLocaleString?.() || recommended.estimated_cost}</span>
            </span>
          </div>

          {Boolean(recommended.is_stale) && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0 text-amber-400" />
              <span>RESOURCE DATA STALE: Reported hospital capacity counts have not been refreshed recently. Verify on-ground availability upon arrival.</span>
            </div>
          )}

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
                <span>{recommended.hospital_name}</span>
                <span className="match-badge bg-[rgba(48,209,88,0.12)] text-[#30d158] border border-[rgba(48,209,88,0.3)] inline-flex items-center gap-1 font-semibold text-[10px]">
                  <ShieldCheck size={11} /> Admin-verified
                </span>
                {Boolean((recommended as any).simulated) && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    SIMULATED
                  </span>
                )}
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
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-xs text-[var(--muted)] flex items-center gap-1">
                  <Shield size={12} className="text-[#30d158]" /> Supported Insurance:
                </span>
                {getDisplayInsurances(recommended.hospital_name, (recommended as any).supported_insurance).slice(0, 4).map((ins, i) => (
                  <span key={i} className="match-badge bg-[rgba(48,209,88,0.12)] text-[#30d158] border border-[rgba(48,209,88,0.3)]">
                    {ins}
                  </span>
                ))}
                {getDisplayInsurances(recommended.hospital_name, (recommended as any).supported_insurance).length > 4 && (
                  <span className="match-badge text-[var(--muted)]">
                    +{getDisplayInsurances(recommended.hospital_name, (recommended as any).supported_insurance).length - 4} more
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => handleSelect(recommended.hospital_id)}
              disabled={selecting}
              className="sos-btn select-hospital-btn flex items-center justify-center gap-2 px-5 py-3 text-sm shrink-0 min-h-[48px] w-full md:w-auto cursor-pointer"
            >
              <Navigation size={15} />
              {selecting ? 'Selecting...' : 'SELECT RECOMMENDED'}
              <ArrowRight size={15} />
            </button>
          </div>

          {/* WHY THIS HOSPITAL? Checklist */}
          {((recommended.why_this && recommended.why_this.length > 0) || (recommended.explanation && recommended.explanation.length > 0)) && (
            <div className="p-3.5 rounded-xl bg-[#21262d] border border-[#30363d] text-xs text-[#8b949e] space-y-2">
              <div className="font-mono text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 size={12} /> WHY THIS HOSPITAL? (DECISION FACTORS)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {((recommended.why_this && recommended.why_this.length > 0) ? recommended.why_this : recommended.explanation).map((exp, i) => (
                  <div key={i} className="flex items-center gap-2 text-neutral-200">
                    <CheckCircle2 size={13} className="text-ok-400 shrink-0" />
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
            Hospitals within range are reviewing the emergency request. Decision-support algorithm ranks clinical fit, route ETA, and reported ICU availability once facilities accept.
          </p>
        </div>
      )}

      {/* No Hospital Accepted Escalation Flow */}
      {acceptedCount === 0 && totalContacted > 0 && (
        <aside role="alert" className="w-full bg-amber-950/40 border-2 border-amber-500/50 text-white p-5 rounded-2xl space-y-3 shadow-xl">
          <div className="flex items-center gap-2.5 text-amber-400 font-bold text-base">
            <AlertTriangle size={22} className="shrink-0" />
            <span>NO HOSPITAL ACCEPTED YET — ESCALATION WORKFLOW</span>
          </div>
          <p className="text-xs text-neutral-200 leading-relaxed max-w-2xl">
            None of the {totalContacted} contacted emergency facilities have confirmed admission yet. Escalate to central ambulance dispatch (108 / 112) or manually select any facility to override.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={() => {
                const firstAvailable = optionsToRender[0];
                if (firstAvailable) {
                  setOverrideHospital({ id: firstAvailable.hospital_id, name: firstAvailable.hospital_name });
                  setOverrideModalOpen(true);
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md transition-all cursor-pointer min-h-[44px]"
            >
              Select Hospital Manually (Override)
            </button>
            <a
              href="tel:108"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#ff3b30] hover:bg-[#ff453a] text-white text-xs font-bold transition-all min-h-[44px]"
            >
              📞 Call 108
            </a>
            <a
              href="tel:112"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white text-xs font-bold transition-all min-h-[44px]"
            >
              📞 Call 112
            </a>
          </div>
        </aside>
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
            {acceptedCount} Accepted · {rejectedCount} Rejected · {pendingCount} Pending · costs shown per hospital
          </span>
        </div>

        <div className="space-y-2">
          {optionsToRender.map(opt => (
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
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-white text-sm">{opt.hospital_name}</h4>
                    <span className="match-badge bg-[rgba(48,209,88,0.12)] text-[#30d158] border border-[rgba(48,209,88,0.3)] inline-flex items-center gap-1 font-semibold text-[10px]">
                      <ShieldCheck size={10} /> Admin-verified
                    </span>
                    {Boolean(opt.simulated) && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                        SIMULATED
                      </span>
                    )}
                    {opt.is_recommended && (
                      <span className="match-badge">BEST OVERALL</span>
                    )}
                    {Boolean(opt.is_stale) && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        ⚠ Data stale
                      </span>
                    )}
                    {(opt.flag === "requirement not confirmed" || (opt as any).requirement_unconfirmed) && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        requirement not confirmed
                      </span>
                    )}
                    {(opt.score ?? 0) > 0 && (
                      <span className="match-badge">{Math.round(opt.score!)} SCORE</span>
                    )}
                    {(() => {
                      const insList = getDisplayInsurances(opt.hospital_name, (opt as any).supported_insurance);
                      return (
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="text-[10px] text-[var(--muted)] flex items-center gap-0.5 mr-0.5">
                            <Shield size={10} className="text-[#30d158]" /> Insurance:
                          </span>
                          {insList.slice(0, 3).map((ins: string, idx: number) => (
                            <span key={idx} className="match-badge text-[#30d158] bg-[rgba(48,209,88,0.08)] border-[rgba(48,209,88,0.25)]">
                              {ins}
                            </span>
                          ))}
                          {insList.length > 3 && (
                            <span className="match-badge">+{insList.length - 3} more</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <p className="text-[#6e7681]">{opt.hospital_address} · {opt.distance_km} km</p>
                  
                  {opt.hospital_capabilities && (
                    <p className="font-mono text-[#484f58]">Specialties: <span className="text-[#8b949e]">{opt.hospital_capabilities}</span></p>
                  )}

                  {/* Primary Exclusion Factor */}
                  {opt.primary_exclusion && (
                    <p className="text-red-400 font-semibold text-[11px] flex items-center gap-1">
                      <XCircle size={11} /> Primary Exclusion: {opt.primary_exclusion}
                    </p>
                  )}

                  {/* WHY NOT Factors for non-recommended or rejected */}
                  {!opt.is_recommended && opt.why_not && opt.why_not.length > 0 && (
                    <div className="text-[11px] text-neutral-400 pl-3 border-l-2 border-neutral-700/60 space-y-0.5 pt-0.5">
                      <span className="text-[10px] font-mono text-neutral-500 block uppercase">Why not selected:</span>
                      {opt.why_not.map((reason, ridx) => (
                        <div key={ridx} className="flex items-center gap-1.5 text-neutral-300">
                          <span className="text-neutral-500">·</span> {reason}
                        </div>
                      ))}
                    </div>
                  )}

                  {opt.rejection_reason && !opt.primary_exclusion && (
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

      {/* Manual Override Confirmation Modal */}
      {overrideModalOpen && overrideHospital && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in">
          <div className="v2-card p-6 max-w-lg w-full space-y-4 border border-amber-500/40 bg-[#161b22] text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle size={18} />
                <span>MANUAL HOSPITAL OVERRIDE</span>
              </div>
              <button
                onClick={() => setOverrideModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              You are manually choosing <strong className="text-white">{overrideHospital.name}</strong> instead of the system recommended facility. An audit log entry will permanently record this override.
            </p>

            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase text-neutral-400 block font-semibold">
                Reason for Manual Selection (Required):
              </label>
              {[
                "Patient or family preference",
                "Attending physician directive",
                "Specific cashless insurance tie-up",
                "Closer to kin / primary caregiver",
                "Pre-existing medical record at facility",
                "Other (specify below)"
              ].map((reason) => (
                <label key={reason} className="flex items-center gap-2.5 p-2 rounded-lg bg-neutral-800/40 border border-neutral-700/40 text-xs cursor-pointer hover:bg-neutral-800/70">
                  <input
                    type="radio"
                    name="override_reason"
                    value={reason}
                    checked={overrideReason === reason}
                    onChange={() => setOverrideReason(reason)}
                    className="accent-[#ff3b30]"
                  />
                  <span>{reason}</span>
                </label>
              ))}

              {overrideReason === "Other (specify below)" && (
                <input
                  type="text"
                  placeholder="Enter detailed override reason..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full bg-black/40 border border-neutral-700 rounded-xl p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#ff3b30]"
                />
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOverrideModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalReason = overrideReason === "Other (specify below)" ? (customReason.trim() || "Other reason") : overrideReason;
                  handleSelect(overrideHospital.id, finalReason);
                }}
                disabled={selecting}
                className="px-5 py-2.5 rounded-xl bg-[#ff3b30] hover:bg-[#ff453a] text-white text-xs font-bold transition-transform active:scale-95 shadow-lg"
              >
                {selecting ? 'Recording Override…' : 'Confirm & Select Hospital'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
