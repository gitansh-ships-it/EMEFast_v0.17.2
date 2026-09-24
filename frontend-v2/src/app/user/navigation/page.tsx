"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navigation, MapPin, Clock, CheckCircle2, Radio, AlertTriangle, ArrowRight } from 'lucide-react';
import LiveMap from '@/components/LiveMap';
import api from '@/lib/api';
import { EmergencyCase } from '@/types';
import { formatEnum } from '@/lib/format';

export default function NavigationPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-[#6e7681] font-mono text-xs">Loading navigation...</div>}>
      <NavigationInner />
    </Suspense>
  );
}

function NavigationInner() {
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get('case_id');
  const [currentCase, setCurrentCase] = useState<EmergencyCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);

  useEffect(() => {
    const fetchCase = async () => {
      try {
        const id = caseIdParam || (typeof window !== 'undefined' ? localStorage.getItem('emefast_current_case_id') : null);
        if (id) {
          const res = await api.get(`/emergency/${id}`);
          setCurrentCase(res.data);
        } else {
          const res = await api.get('/emergency/active/current');
          if (res.data) {
            setCurrentCase(res.data);
          }
        }
      } catch {}
      finally { setLoading(false); }
    };
    fetchCase();
    const interval = setInterval(fetchCase, 5000);
    return () => clearInterval(interval);
  }, [caseIdParam]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pt-[env(safe-area-inset-top,0px)] pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))]">
      <div>
        <div className="eyebrow flex items-center gap-1.5 mb-1.5 text-ok-400">
          <Navigation size={13} className="shrink-0" /> Route & Navigation
        </div>
        <h1 className="page-title">Hospital Route</h1>
        <p className="page-subtitle mt-1">Live route, destination readiness and arrival coordination</p>
      </div>

      {currentCase ? (
        <>
          {/* Destination card */}
          <div className="v2-card p-4 sm:p-5 border-l-4 border-ok-400 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge-green px-2 py-0.5 rounded font-mono text-xs font-bold">{formatEnum(currentCase.status)}</span>
              <span className="badge-red px-2 py-0.5 rounded font-mono text-xs">{currentCase.case_code}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${currentCase.priority === 'CRITICAL' ? 'badge-red' : 'badge-amber'}`}>
                {formatEnum(currentCase.priority)}
              </span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">{currentCase.selected_hospital?.name || 'Hospital ER'}</h2>
              <p className="text-xs text-[#6e7681] flex items-center gap-1 mt-0.5">
                <MapPin size={12} className="text-[#484f58]" />
                {currentCase.selected_hospital?.address || 'Navigating...'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 navigation-metrics">
              {[
                { label: 'ETA', value: routeInfo ? `${routeInfo.durationMin} MIN` : 'Calculating…', color: 'text-sos-300' },
                { label: 'Distance', value: routeInfo ? `${routeInfo.distanceKm.toFixed(1)} km` : 'Calculating…', color: 'text-white' },
                { label: 'ICU Beds', value: `${currentCase.selected_hospital?.available_icu || '—'} Open`, color: 'text-ok-400' },
              ].map(m => (
                <div key={m.label} className="p-2.5 sm:p-3 rounded-lg bg-[#21262d] border border-[#30363d] text-center sm:text-left">
                  <span className="text-[10px] font-mono text-[#484f58] uppercase block">{m.label}</span>
                  <span className={`text-xs sm:text-sm font-bold truncate block ${m.color}`}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Real map + route */}
          <div className="v2-card overflow-hidden shadow-2xl">
            <LiveMap
              origin={{ lat: currentCase.latitude, lng: currentCase.longitude }}
              destination={currentCase.selected_hospital ? { lat: currentCase.selected_hospital.latitude, lng: currentCase.selected_hospital.longitude } : null}
              destinationLabel={currentCase.selected_hospital?.name || 'Hospital ER'}
              onRouteInfo={setRouteInfo}
            />
            <div className="p-4 sm:px-5 border-t border-[#21262d] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs font-mono text-[#6e7681]">
                <span className="text-ok-400">●</span> GPS tracking enabled · live position updates when permitted
              </div>
              <span className="text-[11px] text-[#484f58] shrink-0">
                Case: {currentCase.latitude?.toFixed(4)}, {currentCase.longitude?.toFixed(4)}
              </span>
            </div>
          </div>

          {/* Arrival instructions */}
          <div className="v2-card p-4 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 size={15} className="text-ok-400" /> Pre-Arrival Instructions
            </h3>
            <ul className="space-y-2 text-xs text-[#8b949e]">
              {[
                'ER staff have been alerted — go directly to Emergency Bay 2',
                'Bring patient ID and any existing medical records',
                `Tell reception your case code: ${currentCase.case_code}`,
                'Doctor pre-arrival protocol is active — trauma team is ready',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#21262d] border border-[#30363d] text-[10px] font-bold text-[#6e7681] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="v2-card p-8 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 mx-auto text-sos-400" />
          <h2 className="text-sm font-bold text-white">No Hospital Selected</h2>
          <p className="text-xs text-[#6e7681]">Select a hospital from the discovery page to open the selected hospital route.</p>
          <Link href="/user/hospitals" className="inline-flex items-center gap-1.5 py-2 px-4 rounded bg-sos-400 text-white text-xs font-semibold">
            Hospital Discovery <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </div>
  );
}
