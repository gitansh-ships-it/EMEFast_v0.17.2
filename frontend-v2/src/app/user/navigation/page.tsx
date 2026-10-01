"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navigation, MapPin, CheckCircle2, ArrowLeft, AlertTriangle } from "lucide-react";
import LiveMap, { RouteInfo } from "@/components/LiveMap";
import api from "@/lib/api";
import { EmergencyCase } from "@/types";
import { formatEnum } from "@/lib/format";

export default function NavigationPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-neutral-400 font-mono text-xs">Loading navigation…</div>}>
      <NavigationInner />
    </Suspense>
  );
}

function NavigationInner() {
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get("case_id");
  const hospitalIdParam = searchParams.get("hospital_id");

  const [currentCase, setCurrentCase] = useState<EmergencyCase | null>(null);
  const [targetHospital, setTargetHospital] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  useEffect(() => {
    const fetchCaseAndHospital = async () => {
      try {
        const id = caseIdParam || (typeof window !== "undefined" ? localStorage.getItem("emefast_current_case_id") : null);
        let cData: EmergencyCase | null = null;

        if (id) {
          const res = await api.get(`/emergency/${id}`);
          cData = res.data;
        } else {
          const res = await api.get("/emergency/active/current");
          if (res.data) cData = res.data;
        }

        if (cData) {
          setCurrentCase(cData);
          if (typeof window !== "undefined") {
            localStorage.setItem("emefast_current_case_id", String(cData.id));
          }

          // Determine target hospital: from query param, or saved selection, or case selected hospital
          const savedHospId =
            hospitalIdParam ||
            (typeof window !== "undefined" ? localStorage.getItem(`emefast_selected_hospital_${cData.id}`) : null) ||
            cData.selected_hospital?.id ||
            (cData as any).selected_hospital_id;

          if (savedHospId) {
            try {
              const hRes = await api.get(`/hospitals/${savedHospId}`);
              setTargetHospital(hRes.data);
              if (typeof window !== "undefined") {
                localStorage.setItem(`emefast_selected_hospital_${cData.id}`, String(savedHospId));
              }
            } catch {
              if (cData.selected_hospital) setTargetHospital(cData.selected_hospital);
            }
          } else if (cData.selected_hospital) {
            setTargetHospital(cData.selected_hospital);
          }
        }
      } catch {
        // Fallback gracefully
      } finally {
        setLoading(false);
      }
    };

    fetchCaseAndHospital();
    const interval = setInterval(fetchCaseAndHospital, 6000);
    return () => clearInterval(interval);
  }, [caseIdParam, hospitalIdParam]);

  const activeHospital = targetHospital || currentCase?.selected_hospital;
  const backHref = currentCase
    ? `/user/hospitals?case_id=${currentCase.id}${activeHospital?.id ? `&selected_id=${activeHospital.id}` : ""}`
    : "/user/hospitals";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
      {/* Back Link to preserve hospital selection */}
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-xs font-mono text-[var(--muted)] hover:text-white transition-colors"
        >
          <ArrowLeft size={14} /> Back to Hospital Selection
        </Link>
      </div>

      {currentCase ? (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <div className="eyebrow flex items-center gap-1.5 text-emerald-400 font-mono text-xs">
                <Navigation size={13} className="shrink-0" /> Live Emergency Route & Navigation
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
                Hospital Transit Route
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold">
                {formatEnum(currentCase.status)}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 font-mono text-xs font-bold">
                {currentCase.case_code}
              </span>
            </div>
          </div>

          {/* Selected Hospital Destination Card */}
          <div className="v2-card p-4 sm:p-5 border-l-4 border-emerald-400 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block">
                  SELECTED DESTINATION
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  {activeHospital?.name || "Emergency Department"}
                </h2>
                <p className="text-xs text-neutral-400 flex items-center gap-1 mt-0.5">
                  <MapPin size={12} className="text-neutral-500" />
                  {activeHospital?.address || "Jaipur, Rajasthan"}
                </p>
              </div>

              <div className="flex items-center gap-2 sm:self-center">
                <Link
                  href={backHref}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-mono text-xs font-semibold border border-white/15 transition-colors"
                >
                  Change Hospital
                </Link>
              </div>
            </div>

            {/* Metrics synchronized with authoritative route */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 navigation-metrics pt-1">
              <div className="p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">
                  {routeInfo?.isRoadRoute ? "Road Distance" : "Approx. Straight-Line"}
                </span>
                <span className="text-sm sm:text-base font-bold text-white">
                  {routeInfo ? `${routeInfo.distanceKm.toFixed(1)} km` : "Calculating…"}
                </span>
              </div>

              <div className="p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">
                  {routeInfo?.isTrafficAware ? "Traffic-Aware ETA" : "Driving ETA"}
                </span>
                <span className="text-sm sm:text-base font-bold text-emerald-400">
                  {routeInfo?.isFailed
                    ? "ROUTE UNAVAILABLE"
                    : routeInfo
                    ? `${routeInfo.durationMin} MIN`
                    : "Calculating…"}
                </span>
                {routeInfo && !routeInfo.isFailed && (
                  <span className="text-[9px] font-mono text-neutral-400 block mt-0.5">
                    {routeInfo.isTrafficAware
                      ? (routeInfo.trafficDelayMin || 0) > 0
                        ? `+${routeInfo.trafficDelayMin}m traffic delay`
                        : "Normal Traffic Flow"
                      : "Traffic data unavailable"}
                  </span>
                )}
              </div>

              <div className="p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[10px] font-mono text-neutral-400 uppercase block">ICU Beds</span>
                <span className="text-sm sm:text-base font-bold text-emerald-400">
                  {`${activeHospital?.available_icu ?? "—"} Available`}
                </span>
                <span className="text-[9px] font-mono text-neutral-400 block mt-0.5">
                  Emergency Department Online
                </span>
              </div>
            </div>
          </div>

          {/* Clean Uncluttered Map Card */}
          <div className="w-full h-[460px] sm:h-[520px]">
            <LiveMap
              origin={{ lat: currentCase.latitude, lng: currentCase.longitude }}
              destination={
                activeHospital
                  ? { lat: activeHospital.latitude, lng: activeHospital.longitude }
                  : null
              }
              destinationLabel={activeHospital?.name || "Hospital ER"}
              onRouteInfo={setRouteInfo}
              trackDeviceGps={true}
              gpsAccuracy={currentCase.gps_accuracy}
            />
          </div>

          {/* Pre-Arrival Protocols */}
          <div className="v2-card p-4 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-400" /> Pre-Arrival Coordination
            </h3>
            <ul className="space-y-2 text-xs text-neutral-300">
              {[
                "Facility notified of inbound patient — proceed directly to ER bay.",
                `Case Identifier: ${currentCase.case_code} (authoritative reference for hospital intake).`,
                "Doctor pre-arrival protocol active — clinical requirements transmitted.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold text-neutral-300 flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="v2-card p-8 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 mx-auto text-amber-400" />
          <h2 className="text-sm font-bold text-white">No Hospital Selected</h2>
          <p className="text-xs text-neutral-400">
            Select a hospital from the discovery page to view transit route and arrival coordination.
          </p>
          <Link
            href="/user/hospitals"
            className="inline-flex items-center gap-1.5 py-2 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
          >
            Hospital Discovery
          </Link>
        </div>
      )}
    </div>
  );
}
