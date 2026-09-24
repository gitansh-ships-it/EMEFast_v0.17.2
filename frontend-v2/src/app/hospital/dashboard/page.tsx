"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Hospital as HospitalIcon,
  RefreshCw,
  MapPin,
  Mic,
  AlertTriangle,
  Siren,
  ShieldCheck,
  Bed,
  HeartPulse,
  ChevronDown,
  ChevronUp,
  Undo2,
  ExternalLink,
  Radio,
  Volume2,
} from "lucide-react";
import api from "@/lib/api";
import { formatEnum, formatElapsedTime, formatDateTime } from "@/lib/format";
import { EmergencyCase, Hospital as HospitalType } from "@/types";
import { getAuthSession, AuthSession } from "@/lib/auth";
import { useHospital } from "@/context/HospitalContext";

// Dynamically import LiveMap with SSR disabled to prevent Leaflet window errors
const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="h-56 w-full rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-xs text-[var(--muted)]">
      <RefreshCw size={16} className="animate-spin mr-2" /> Loading Route Map...
    </div>
  ),
});

interface ToastState {
  id: number;
  message: string;
  type: "success" | "declined" | "info";
  undoCaseId?: number;
}

interface PassedCaseRecord {
  caseItem: EmergencyCase;
  reason: string;
  declinedAt: string;
}

export default function HospitalDashboard() {
  const { setInboxCount, setActiveCount } = useHospital();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [hospitals, setHospitals] = useState<HospitalType[]>([]);
  const [hospitalId, setHospitalId] = useState<number | null>(null);
  const [hospitalInfo, setHospitalInfo] = useState<HospitalType | null>(null);

  // Categorized Case Lists
  const [incomingCases, setIncomingCases] = useState<EmergencyCase[]>([]);
  const [activeCases, setActiveCases] = useState<EmergencyCase[]>([]);
  const [passedCases, setPassedCases] = useState<PassedCaseRecord[]>([]);

  // Navigation tab: 'pending' | 'active' | 'passed'
  const [activeTab, setActiveTab] = useState<"pending" | "active" | "passed">("pending");

  // Operational State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [selectedForReject, setSelectedForReject] = useState<EmergencyCase | null>(null);
  const [rejectionReason, setRejectionReason] = useState("Required Specialist Unavailable");
  const [expandedMapId, setExpandedMapId] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Toast Notification with Undo
  const [toast, setToast] = useState<ToastState | null>(null);

  // Live timer tick every second for elapsed T+ timers
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize Session and Facility
  useEffect(() => {
    const s = getAuthSession();
    setSession(s);

    if (s?.role === "HOSPITAL") {
      if (s.hospital_id) {
        setHospitalId(s.hospital_id);
      } else {
        setError("Account Error: No hospital ID assigned to this facility token.");
        setLoading(false);
      }
    } else if (s?.role === "ADMIN") {
      // Admin surveillance mode: load all facilities and default to first
      api
        .get("/hospitals")
        .then((r) => {
          const list: HospitalType[] = r.data || [];
          setHospitals(list);
          if (list.length > 0) {
            setHospitalId((prev) => prev ?? list[0].id);
          }
        })
        .catch((err) => {
          setError(err.response?.data?.detail || "Failed to load facility registry.");
        });
    }
  }, []);

  // Fetch Hospital Info, Incoming (Pending), and Active Cases concurrently
  const fetchData = useCallback(
    async (targetId?: number) => {
      const id = targetId ?? hospitalId;
      if (!id) return;
      try {
        setError(null);
        const [infoRes, incomingRes, activeRes] = await Promise.all([
          api.get(`/hospitals/${id}`),
          api.get(`/hospitals/${id}/incoming`),
          api.get(`/hospitals/${id}/active-cases`),
        ]);

        setHospitalInfo(infoRes.data);

        const incomingList: EmergencyCase[] = incomingRes.data || [];
        setIncomingCases(incomingList);
        setInboxCount(incomingList.length);

        const activeList: EmergencyCase[] = activeRes.data || [];
        setActiveCases(activeList);
        setActiveCount(activeList.length);

        setLastSyncedAt(new Date());
      } catch (err: any) {
        const status = err.response?.status;
        const detail = err.response?.data?.detail;
        if (status === 401) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("emefast_token");
            localStorage.removeItem("emefast_role");
            if (window.location.pathname !== "/login") {
              window.location.href = "/login";
            }
          }
          return;
        } else if (status === 403) {
          setError(
            `Access forbidden (403): ${
              detail || "You do not have permission to access this facility's triage queue."
            }`
          );
        } else {
          setError(detail || "Unable to connect to hospital intake network. Check connectivity.");
        }
      } finally {
        setLoading(false);
      }
    },
    [hospitalId, setInboxCount, setActiveCount]
  );

  // Background polling every 2.5s
  useEffect(() => {
    if (!hospitalId) return;
    fetchData(hospitalId);
    const interval = setInterval(() => fetchData(hospitalId), 2500);
    return () => clearInterval(interval);
  }, [hospitalId, fetchData]);

  // Handle Accept or Decline Actions
  const respondToCase = async (
    c: EmergencyCase,
    action: "ACCEPTED" | "REJECTED",
    customReason?: string
  ) => {
    if (!hospitalId) return;
    const reason = customReason ?? rejectionReason;
    if (action === "REJECTED" && !reason.trim()) return;

    setProcessingId(c.id);
    try {
      const existingResp = c.responses?.find((r) => r.hospital_id === hospitalId);
      const calculatedEta = Math.max(2, Math.round((existingResp?.eta || 8) * 10) / 10);

      await api.post(`/hospitals/${hospitalId}/respond/${c.id}`, {
        response: action,
        eta: action === "ACCEPTED" ? calculatedEta : undefined,
        rejection_reason: action === "REJECTED" ? reason.trim() : undefined,
      });

      setSelectedForReject(null);

      // Trigger user feedback and toast notification
      if (action === "ACCEPTED") {
        setToast({
          id: Date.now(),
          message: `Case ${c.case_code} ACCEPTED — Ambulance crew notified of ER standby.`,
          type: "success",
        });
        // Remove from passed if previously declined
        setPassedCases((prev) => prev.filter((p) => p.caseItem.id !== c.id));
      } else {
        setToast({
          id: Date.now(),
          message: `Case ${c.case_code} DECLINED (${reason}).`,
          type: "declined",
          undoCaseId: c.id,
        });
        // Track in passed cases list
        setPassedCases((prev) => [
          {
            caseItem: c,
            reason: reason.trim(),
            declinedAt: new Date().toLocaleTimeString(),
          },
          ...prev.filter((p) => p.caseItem.id !== c.id),
        ]);
      }

      // Re-fetch immediately to synchronize backend state
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Could not update the hospital response. Please retry.");
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Undo on a declined case: quickly accept it
  const handleUndoDecline = async (caseId: number) => {
    const record = passedCases.find((p) => p.caseItem.id === caseId);
    const targetCase =
      record?.caseItem ||
      incomingCases.find((c) => c.id === caseId) ||
      activeCases.find((c) => c.id === caseId);
    if (!targetCase) return;

    setToast(null);
    await respondToCase(targetCase, "ACCEPTED");
  };

  // Helper to parse vitals string into readable token badges
  const parsedVitals = (vitalsStr?: string | null) => {
    if (!vitalsStr) return [];
    return vitalsStr
      .split(/[,;•|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  return (
    <div className="hospital-shell space-y-6">
      {/* =========================================================================
          1. OPERATIONAL HUD / STAT SUMMARY BAR (Matte Scope-Locked Design)
          ========================================================================= */}
      <section className="hospital-hero glass-panel !backdrop-blur-none bg-[#15181c] dark:bg-[#15181c] border border-white/10 rounded-2xl p-6">
        <div className="space-y-1.5">
          <div className="eyebrow flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[var(--muted)]">
            <Radio size={13} className="text-[#ff3b30] animate-pulse" />
            <span>VERIFIED ER DESK · LIVE INBOX</span>
            <span className="text-white/20">|</span>
            <span className="text-[11px] text-[var(--muted)] font-normal">
              Synced: {lastSyncedAt.toLocaleTimeString()}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white m-0">
            Emergency Case Intake
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed max-w-2xl m-0">
            Real-time ambulance telemetry, incoming broadcast triage, and immediate admission coordination.
          </p>
        </div>

        <div className="hospital-tools flex flex-wrap items-center gap-3 mt-4 sm:mt-0">
          {/* Facility Selector / Badge */}
          <div className="hospital-picker">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-[var(--muted)]">
              Active Facility
            </span>
            {session?.role === "ADMIN" ? (
              <select
                value={hospitalId ?? ""}
                onChange={(e) => setHospitalId(Number(e.target.value))}
                className="bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
              >
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id} className="bg-[#1c1c1e] text-white">
                    {h.name}
                  </option>
                ))}
              </select>
            ) : (
              <div
                className="text-xs font-mono font-bold text-white px-3 py-2 bg-white/5 border border-white/10 rounded-xl truncate max-w-[220px]"
                title={hospitalInfo?.name || "Assigned ER Facility"}
              >
                {hospitalInfo?.name || (hospitalId ? `Hospital #${hospitalId}` : "Assigned Facility")}
              </div>
            )}
          </div>

          {/* Sync Button */}
          <button
            className="sync-button min-h-[40px] px-4 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-bold font-mono inline-flex items-center gap-2 transition-all cursor-pointer"
            onClick={() => fetchData()}
            disabled={loading}
            aria-label="Synchronize intake stream"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Sync</span>
          </button>
        </div>
      </section>

      {/* 3 Operational KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Pending Requests */}
        <div
          onClick={() => setActiveTab("pending")}
          className={`v2-card p-4 rounded-xl border transition-all cursor-pointer ${
            incomingCases.length > 0
              ? "border-[#ff3b30]/50 bg-[#ff3b30]/[0.04]"
              : "border-[var(--stroke)]"
          } ${activeTab === "pending" ? "ring-2 ring-[#ff3b30]/50" : ""}`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-[var(--muted)]">
            <span className="font-semibold">Pending Requests</span>
            <AlertTriangle
              size={15}
              className={incomingCases.length > 0 ? "text-[#ff3b30]" : "text-[var(--muted)]"}
            />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-[var(--text)] tnum">{incomingCases.length}</span>
            {incomingCases.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ff3b30]/15 text-[#ff453a]">
                ACTION REQUIRED
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1">Awaiting triage & admission response</p>
        </div>

        {/* KPI 2: Active Cases */}
        <div
          onClick={() => setActiveTab("active")}
          className={`v2-card p-4 rounded-xl border transition-all cursor-pointer border-[var(--stroke)] ${
            activeTab === "active" ? "ring-2 ring-[var(--stroke-strong)]" : ""
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-[var(--muted)]">
            <span className="font-semibold">Active ER Cases</span>
            <Activity size={15} className="text-[var(--muted)]" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-[var(--text)] tnum">{activeCases.length}</span>
            {activeCases.length > 0 && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[var(--text)]">
                In Transit / Admitted
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1">Accepted emergencies en route or locked</p>
        </div>

        {/* KPI 3: Capacity Status */}
        <div className="v2-card p-4 rounded-xl border border-[var(--stroke)]">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--muted)]">
            <span className="font-semibold">ER Bed Capacity</span>
            <Bed size={15} className="text-[var(--muted)]" />
          </div>
          <div className="flex items-baseline gap-3 mt-2">
            <div>
              <span className="text-2xl font-bold text-[var(--text)] tnum">
                {hospitalInfo?.available_icu ?? "—"}
              </span>
              <span className="text-[10px] text-[var(--muted)] ml-1">ICU</span>
            </div>
            <span className="text-[var(--muted)]/40">/</span>
            <div>
              <span className="text-2xl font-bold text-[var(--text)] tnum">
                {hospitalInfo?.available_beds ?? "—"}
              </span>
              <span className="text-[10px] text-[var(--muted)] ml-1">Total</span>
            </div>
            <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[var(--muted)]">
              ONLINE
            </span>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1 truncate" title={hospitalInfo?.capabilities}>
            {hospitalInfo?.capabilities || "Emergency, ICU, Trauma ready"}
          </p>
        </div>
      </div>

      {/* =========================================================================
          2. TOAST NOTIFICATION / FEEDBACK BANNER (With Undo Action)
          ========================================================================= */}
      {toast && (
        <div
          role="status"
          className={`flex items-center justify-between gap-4 p-4 rounded-xl border transition-all ${
            toast.type === "success"
              ? "bg-[#10b981]/15 border-[#10b981]/35 text-[#30d158]"
              : toast.type === "declined"
              ? "bg-[#ff3b30]/15 border-[#ff3b30]/35 text-[#ff6b63]"
              : "bg-blue-500/15 border-blue-500/30 text-blue-300"
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
            {toast.type === "success" ? (
              <CheckCircle2 size={18} className="shrink-0 text-[#30d158]" />
            ) : (
              <XCircle size={18} className="shrink-0 text-[#ff453a]" />
            )}
            <span>{toast.message}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {toast.undoCaseId && (
              <button
                onClick={() => handleUndoDecline(toast.undoCaseId!)}
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold font-mono flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Undo2 size={13} /> Undo
              </button>
            )}
            <button
              onClick={() => setToast(null)}
              className="text-xs font-mono text-white/50 hover:text-white px-1.5 py-0.5"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          3. CATEGORIZED NAVIGATION TABS
          ========================================================================= */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2" role="tablist">
          {/* Tab 1: Pending Requests */}
          <button
            role="tab"
            aria-selected={activeTab === "pending"}
            onClick={() => setActiveTab("pending")}
            className={`min-h-[38px] px-4 rounded-xl text-xs font-bold font-mono inline-flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "pending"
                ? "bg-[#ff3b30] text-white shadow-lg shadow-[#ff3b30]/20"
                : "bg-white/5 hover:bg-white/10 text-[var(--muted)]"
            }`}
          >
            <AlertTriangle size={14} />
            <span>Pending Requests</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === "pending" ? "bg-black/30 text-white" : "bg-white/10 text-neutral-300"
              }`}
            >
              {incomingCases.length}
            </span>
          </button>

          {/* Tab 2: Accepted Cases */}
          <button
            role="tab"
            aria-selected={activeTab === "active"}
            onClick={() => setActiveTab("active")}
            className={`min-h-[38px] px-4 rounded-xl text-xs font-bold font-mono inline-flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "active"
                ? "bg-[#30d158] text-black shadow-lg shadow-[#30d158]/20"
                : "bg-white/5 hover:bg-white/10 text-[var(--muted)]"
            }`}
          >
            <CheckCircle2 size={14} />
            <span>Accepted Cases</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === "active" ? "bg-black/30 text-black" : "bg-white/10 text-neutral-300"
              }`}
            >
              {activeCases.length}
            </span>
          </button>

          {/* Tab 3: Passed / Declined */}
          <button
            role="tab"
            aria-selected={activeTab === "passed"}
            onClick={() => setActiveTab("passed")}
            className={`min-h-[38px] px-4 rounded-xl text-xs font-bold font-mono inline-flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "passed"
                ? "bg-white/20 text-white"
                : "bg-white/5 hover:bg-white/10 text-[var(--muted)]"
            }`}
          >
            <XCircle size={14} />
            <span>Passed</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/10 text-neutral-300">
              {passedCases.length}
            </span>
          </button>
        </div>

        <div className="text-[11px] text-[var(--muted)] font-mono flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Polling interval: 2.5s</span>
        </div>
      </div>

      {/* Network Error Alert */}
      {error && (
        <div
          className="glass-panel border-sos-500/40 bg-sos-950/30 text-center space-y-3 p-6 rounded-2xl"
          role="alert"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-sos-500/10 border border-sos-500/25 flex items-center justify-center text-sos-400">
            <XCircle size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Intake Network Error</h3>
            <p className="text-xs text-sos-300 mt-1 max-w-md mx-auto">{error}</p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="sync-button inline-flex items-center gap-1.5 px-4 py-2 bg-sos-500/20 hover:bg-sos-500/30 text-white rounded-lg text-xs font-mono font-semibold transition-colors mx-auto"
          >
            <RefreshCw size={13} /> Retry Connection
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !error && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="glass-panel p-6 rounded-2xl border border-white/10 animate-pulse space-y-4"
            >
              <div className="h-5 w-48 bg-white/10 rounded" />
              <div className="h-16 w-full bg-white/5 rounded" />
              <div className="h-10 w-64 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* =========================================================================
          TAB 1: INCOMING CASES (PENDING REQUESTS)
          ========================================================================= */}
      {!loading && !error && activeTab === "pending" && (
        <div className="space-y-4">
          {incomingCases.length === 0 ? (
            <div className="glass-panel p-12 rounded-2xl border border-white/10 text-center space-y-3">
              <ShieldCheck size={38} className="mx-auto text-[#30d158]" />
              <h3 className="text-base font-bold text-white m-0">No pending emergency requests</h3>
              <p className="text-xs text-[var(--muted)] max-w-md mx-auto m-0 leading-relaxed">
                All incoming emergency broadcasts in this sector have been triaged. New queries will appear here
                in real time.
              </p>
            </div>
          ) : (
            [...incomingCases]
              .sort((a, b) => {
                const rank = (p?: string) => {
                  switch (p?.toUpperCase()) {
                    case "CRITICAL": return 4;
                    case "UNASSESSED": return 3; // Safety triage: UNASSESSED never ranks below HIGH
                    case "HIGH": return 3;
                    case "MEDIUM": return 2;
                    case "LOW": return 1;
                    default: return 3;
                  }
                };
                return rank(b.priority) - rank(a.priority) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })
              .map((c) => {
              const myResponse = c.responses?.find((r) => r.hospital_id === hospitalId);
              const isPending = myResponse?.response === "PENDING" || !myResponse;
              const vitalsList = parsedVitals(c.vitals);
              const isMapOpen = expandedMapId === c.id;

              return (
                <article
                  key={c.id}
                  className={`glass-panel rounded-2xl border p-5 sm:p-6 space-y-5 transition-all ${
                    c.priority === "CRITICAL"
                      ? "border-[#ff3b30]/40 bg-[#ff3b30]/[0.03] shadow-lg shadow-[#ff3b30]/10"
                      : c.priority === "UNASSESSED"
                      ? "border-amber-500/40 bg-amber-500/[0.03] shadow-md shadow-amber-500/5"
                      : c.priority === "HIGH"
                      ? "border-amber-500/30 bg-amber-500/[0.02]"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  {/* Card Header: Urgency, Code, Elapsed Time */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono font-black text-sm tracking-wider text-[#ff817a]">
                        {c.case_code}
                      </span>
                      <span
                        className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          c.priority === "CRITICAL"
                            ? "bg-[#ff3b30] text-white animate-pulse"
                            : c.priority === "UNASSESSED"
                            ? "unassessed-badge"
                            : c.priority === "HIGH"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-blue-500/20 text-blue-300"
                        }`}
                      >
                        {c.priority === "UNASSESSED" ? "UNASSESSED — TREAT AS HIGH" : formatEnum(c.priority)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--muted)]">
                        <Clock size={12} />
                        <span>T+ {formatElapsedTime(c.created_at)}</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-300">
                        {formatEnum(c.transport_mode)}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      <span>ACTION REQUIRED · PENDING</span>
                    </div>
                  </div>

                  {/* Card Body: Patient, Clinical Vitals, Requirements */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    {/* Column 1: Patient info & condition */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted)]">
                        Patient Assessment
                      </span>
                      <div className="font-bold text-sm text-white">
                        {c.patient_name} {c.patient_age ? `· ${c.patient_age}y` : ""}
                      </div>
                      <p className="text-xs text-[var(--muted)] leading-relaxed font-medium m-0">
                        {c.condition || "Emergency trauma presentation"}
                      </p>
                    </div>

                    {/* Column 2: Vitals summary strip */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
                        <HeartPulse size={12} className="text-[#ff3b30]" /> Patient Vitals
                      </span>
                      {vitalsList.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {vitalsList.map((vital, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-neutral-200"
                            >
                              {vital}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-[var(--muted)] italic m-0">
                          {c.vitals || "No vitals recorded"}
                        </p>
                      )}
                      <div className="text-[11px] text-[var(--muted)] mt-1">
                        <span className="font-semibold text-white/70">Requirements:</span>{" "}
                        {c.requirements || "Emergency stabilization"}
                      </div>
                    </div>

                    {/* Column 3: Location & Transit ETA */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
                        <MapPin size={12} className="text-[#2997ff]" /> Case Location & Route
                      </span>
                      <div className="font-semibold text-white text-[11px] flex items-center gap-1">
                        <span>{c.address || `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`}</span>
                      </div>
                      <div className="text-[11px] font-mono text-[#2997ff]">
                        {myResponse?.eta
                          ? `Estimated Transit: ~${Math.round(myResponse.eta)} min`
                          : "Calculated drive time pending"}
                      </div>
                    </div>
                  </div>

                  {/* Voice Note & Assessment (if present) */}
                  {c.voice_note_path && (
                    <div className="p-3 rounded-xl bg-blue-500/[0.07] border border-blue-500/20 space-y-2">
                      <div className="flex items-center justify-between text-xs text-blue-300 font-bold font-mono">
                        <span className="flex items-center gap-1.5">
                          <Mic size={14} /> Voice Note from Paramedic Crew
                        </span>
                        {c.voice_transcript && (
                          <span className="text-[10px] text-blue-400 font-normal">Transcript Available</span>
                        )}
                      </div>
                      <audio
                        controls
                        preload="none"
                        src={`${(api.defaults.baseURL || "").replace(/\/api$/, "")}${c.voice_note_path}`}
                        className="w-full h-8"
                      />
                      {c.voice_transcript && (
                        <p className="text-[11px] text-neutral-300 italic bg-black/20 p-2 rounded border border-white/5 m-0">
                          &quot;{c.voice_transcript}&quot;
                        </p>
                      )}
                    </div>
                  )}

                  {/* Toggleable Live Route Map */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedMapId(isMapOpen ? null : c.id)}
                      className="text-xs font-mono font-bold text-[#2997ff] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin size={13} />
                      <span>{isMapOpen ? "Hide Route Map" : "View Ambulance Route & GPS Map"}</span>
                      {isMapOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    {isMapOpen && (
                      <div className="mt-3 h-56 w-full rounded-xl overflow-hidden border border-white/10 z-0 relative">
                        <LiveMap
                          origin={{ lat: c.latitude, lng: c.longitude }}
                          destination={
                            hospitalInfo
                              ? { lat: hospitalInfo.latitude, lng: hospitalInfo.longitude }
                              : undefined
                          }
                          destinationLabel={hospitalInfo?.name || "This ER"}
                        />
                      </div>
                    )}
                  </div>

                  {/* Card Actions: TWO CLEAR BUTTONS (ACCEPT & DECLINE) */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10">
                    <div className="text-[11px] text-[var(--muted)] font-mono">
                      <span>Respond promptly to lock this ER as candidate</span>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                      {/* Decline (Subtle / Secondary) */}
                      <button
                        type="button"
                        onClick={() => setSelectedForReject(c)}
                        disabled={processingId === c.id}
                        className="reject-btn min-h-[44px] px-5 rounded-full border border-white/15 bg-white/5 hover:bg-[#ff3b30]/15 text-[#ff8f88] text-xs font-bold font-mono inline-flex items-center justify-center gap-2 transition-all cursor-pointer w-full sm:w-auto"
                        aria-label={`Decline case ${c.case_code}`}
                      >
                        <XCircle size={15} />
                        <span>Decline</span>
                      </button>

                      {/* Accept (Green / Primary / Prominent) */}
                      <button
                        type="button"
                        onClick={() => respondToCase(c, "ACCEPTED")}
                        disabled={processingId === c.id}
                        className="accept-btn min-h-[44px] px-7 rounded-full bg-[#10b981] hover:bg-[#059669] text-white text-xs font-black tracking-wider uppercase inline-flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#10b981]/25 active:scale-95 cursor-pointer w-full sm:w-auto"
                        aria-label={`Accept case ${c.case_code}`}
                      >
                        {processingId === c.id ? (
                          <RefreshCw size={15} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        <span>Accept Emergency</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: ACCEPTED CASES (ACTIVE & EN ROUTE TO THIS ER)
          ========================================================================= */}
      {!loading && !error && activeTab === "active" && (
        <div className="space-y-4">
          {activeCases.length === 0 ? (
            <div className="glass-panel p-12 rounded-2xl border border-white/10 text-center space-y-3">
              <Activity size={38} className="mx-auto text-[#2997ff]" />
              <h3 className="text-base font-bold text-white m-0">No active ER cases</h3>
              <p className="text-xs text-[var(--muted)] max-w-md mx-auto m-0 leading-relaxed">
                When your facility accepts an incoming emergency query, live transit monitoring and ER prep tools
                will appear here.
              </p>
            </div>
          ) : (
            [...activeCases]
              .sort((a, b) => {
                const rank = (p?: string) => {
                  switch (p?.toUpperCase()) {
                    case "CRITICAL": return 4;
                    case "UNASSESSED": return 3; // Safety triage: UNASSESSED never ranks below HIGH
                    case "HIGH": return 3;
                    case "MEDIUM": return 2;
                    case "LOW": return 1;
                    default: return 3;
                  }
                };
                return rank(b.priority) - rank(a.priority) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })
              .map((c) => {
              const myResponse = c.responses?.find((r) => r.hospital_id === hospitalId);
              const isLockedDestination =
                c.selected_hospital?.id === hospitalId || c.status === "HOSPITAL_SELECTED";
              const vitalsList = parsedVitals(c.vitals);
              const isMapOpen = expandedMapId === c.id;

              return (
                <article
                  key={c.id}
                  className={`glass-panel rounded-2xl border p-5 sm:p-6 space-y-5 transition-all ${
                    isLockedDestination
                      ? "border-[#30d158]/50 bg-[#30d158]/[0.04] shadow-lg shadow-[#30d158]/10"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  {/* Status Banner */}
                  <div
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-mono font-bold ${
                      isLockedDestination
                        ? "bg-[#30d158]/15 border-[#30d158]/35 text-[#30d158]"
                        : "bg-blue-500/10 border-blue-500/25 text-blue-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isLockedDestination ? (
                        <>
                          <Siren size={16} className="text-[#30d158] animate-bounce" />
                          <span>DESTINATION LOCKED — PATIENT EN ROUTE TO THIS ER</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} className="text-blue-400" />
                          <span>ACCEPTED — AMBULANCE NOTIFIED (Awaiting Final Selection)</span>
                        </>
                      )}
                    </div>

                    <div className="text-[11px] font-mono">
                      <span>{isLockedDestination ? "HIGH PRIORITY ADMISSION" : "OFFERED ADMISSION"}</span>
                    </div>
                  </div>

                  {/* Header: Code, Patient, Priority */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono font-black text-sm text-[#ff817a]">{c.case_code}</span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase ${
                          c.priority === "CRITICAL"
                            ? "bg-[#ff3b30] text-white"
                            : c.priority === "UNASSESSED"
                            ? "unassessed-badge"
                            : c.priority === "HIGH"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-blue-500/20 text-blue-300"
                        }`}
                      >
                        {c.priority === "UNASSESSED" ? "UNASSESSED — TREAT AS HIGH" : formatEnum(c.priority)}
                      </span>
                      <span className="text-xs text-white font-bold">
                        {c.patient_name} {c.patient_age ? `(${c.patient_age}y)` : ""}
                      </span>
                    </div>

                    <div className="text-xs font-mono text-emerald-400 font-bold">
                      {myResponse?.eta
                        ? `ETA: ~${Math.round(myResponse.eta)} minutes`
                        : "ETA updated in real time"}
                    </div>
                  </div>

                  {/* Vitals and Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase text-[var(--muted)]">
                        Condition & Requirements
                      </span>
                      <p className="font-semibold text-white mt-1 m-0">{c.condition}</p>
                      <p className="text-[11px] text-[var(--muted)] mt-0.5 m-0">
                        Needs: {c.requirements || "Emergency stabilization"}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase text-[var(--muted)]">
                        Recorded Vitals
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {vitalsList.map((vital, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-200"
                          >
                            {vital}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase text-[var(--muted)]">
                        Arrival Prep Protocol
                      </span>
                      <ul className="text-[11px] text-emerald-300/90 list-disc list-inside mt-1 space-y-0.5">
                        <li>Prepare Trauma Bay</li>
                        <li>On-call Specialist on standby</li>
                        <li>Ventilator/ICU bed reserved</li>
                      </ul>
                    </div>
                  </div>

                  {/* Toggle Map */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedMapId(isMapOpen ? null : c.id)}
                      className="text-xs font-mono font-bold text-[#2997ff] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin size={13} />
                      <span>{isMapOpen ? "Hide Route Map" : "View Live Inbound Route"}</span>
                      {isMapOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    {isMapOpen && (
                      <div className="mt-3 h-56 w-full rounded-xl overflow-hidden border border-white/10 z-0 relative">
                        <LiveMap
                          origin={{ lat: c.latitude, lng: c.longitude }}
                          destination={
                            hospitalInfo
                              ? { lat: hospitalInfo.latitude, lng: hospitalInfo.longitude }
                              : undefined
                          }
                          destinationLabel={hospitalInfo?.name || "This ER"}
                        />
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: PASSED / DECLINED CASES (With Reconsider Option)
          ========================================================================= */}
      {!loading && !error && activeTab === "passed" && (
        <div className="space-y-4">
          {passedCases.length === 0 ? (
            <div className="glass-panel p-12 rounded-2xl border border-white/10 text-center space-y-3">
              <CheckCircle2 size={38} className="mx-auto text-[var(--muted)]" />
              <h3 className="text-base font-bold text-white m-0">No declined cases</h3>
              <p className="text-xs text-[var(--muted)] max-w-md mx-auto m-0 leading-relaxed">
                Emergency queries declined due to specialist unavailability or capacity constraints will be listed
                here with reconsideration options.
              </p>
            </div>
          ) : (
            passedCases.map(({ caseItem, reason, declinedAt }) => (
              <article
                key={caseItem.id}
                className="glass-panel rounded-2xl border border-white/10 p-5 space-y-3 opacity-80 hover:opacity-100 transition-opacity"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#ff817a]">{caseItem.case_code}</span>
                    <span className="text-white font-semibold">{caseItem.patient_name}</span>
                    <span className="text-[var(--muted)] text-[11px]">· {caseItem.condition}</span>
                  </div>

                  <div className="text-[11px] font-mono text-red-400 font-semibold flex items-center gap-1.5">
                    <XCircle size={13} />
                    <span>Declined ({reason})</span>
                    <span className="text-white/30">·</span>
                    <span className="text-[var(--muted)]">{declinedAt}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-[11px] text-[var(--muted)]">
                    Did capacity open up? You can reconsider and accept this emergency.
                  </span>
                  <button
                    onClick={() => respondToCase(caseItem, "ACCEPTED")}
                    disabled={processingId === caseItem.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-bold font-mono inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 size={13} /> Reconsider & Accept
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* =========================================================================
          DECLINE REASON MODAL (Explicit Reasons)
          ========================================================================= */}
      {selectedForReject && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="reject-modal glass-panel bg-[#1c1c1e] border border-white/15 p-6 rounded-2xl max-w-md w-full space-y-5 shadow-2xl">
            <div className="space-y-1">
              <div className="eyebrow flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff453a]">
                <XCircle size={14} /> DECLINE EMERGENCY INTAKE
              </div>
              <h3 className="text-lg font-bold text-white m-0">
                Decline Case {selectedForReject.case_code}?
              </h3>
              <p className="text-xs text-[var(--muted)] m-0">
                Select an operational reason so the crew can be redirected to an alternate facility.
              </p>
            </div>

            <div className="reason-list space-y-2">
              {[
                "Required Specialist Unavailable",
                "ICU Bed Capacity Full",
                "Oxygen Supply Constraints",
                "Emergency Department Maintenance",
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setRejectionReason(reason)}
                  className={`w-full text-left p-3 rounded-xl border text-xs font-bold font-mono transition-all cursor-pointer ${
                    rejectionReason === reason
                      ? "bg-[#ff3b30]/15 border-[#ff3b30]/50 text-white"
                      : "bg-white/5 border-white/10 text-[var(--muted)] hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="modal-actions flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedForReject(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold font-mono transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => respondToCase(selectedForReject, "REJECTED")}
                disabled={processingId === selectedForReject.id}
                className="px-5 py-2 rounded-xl bg-[#ff3b30] hover:bg-[#ff453a] text-white text-xs font-black tracking-wider uppercase font-mono shadow-md shadow-[#ff3b30]/20 transition-all cursor-pointer"
              >
                {processingId === selectedForReject.id ? (
                  <RefreshCw size={13} className="animate-spin inline mr-1" />
                ) : null}
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
