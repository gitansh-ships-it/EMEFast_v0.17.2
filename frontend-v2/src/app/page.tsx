"use client";
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Mic, MapPin, ShieldCheck, Siren, Hospital, Activity, Phone, Navigation, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';

function HoldSOS({onComplete}:{onComplete:()=>void}){
  const [holding,setHolding]=useState(false);
  const [progress,setProgress]=useState(0);
  const [cancelled,setCancelled]=useState(false);
  const [activated,setActivated]=useState(false);
  const timer=useRef<ReturnType<typeof setInterval>|null>(null);
  const cancelTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  const start=()=>{
    if(holding || activated) return;
    setHolding(true);
    setCancelled(false);
    setProgress(0);
    if(cancelTimer.current) clearTimeout(cancelTimer.current);
    if('vibrate' in navigator) navigator.vibrate(40);
    let p=0;
    timer.current=setInterval(()=>{
      p+=100/30;
      setProgress(Math.min(p,100));
      if(p>=100){
        clearInterval(timer.current!);
        if('vibrate' in navigator) navigator.vibrate([100,50,200]);
        setHolding(false);
        setActivated(true);
        onComplete();
      }
    },100);
  };

  const stop=()=>{
    if(activated) return;
    if(timer.current){
      clearInterval(timer.current);
      if(holding && progress > 5 && progress < 100){
        setCancelled(true);
        cancelTimer.current = setTimeout(()=>setCancelled(false), 1800);
      }
    }
    setHolding(false);
    setProgress(0);
  };

  return (
    <div className="flex flex-col items-center">
      <button
        aria-label="Hold for emergency SOS"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onTouchStart={(e) => { e.preventDefault(); start(); }}
        onTouchEnd={stop}
        onTouchCancel={stop}
        onContextMenu={e=>e.preventDefault()}
        disabled={activated}
        className={`homepage-sos-btn relative w-44 h-44 sm:w-52 sm:h-52 rounded-full select-none touch-none flex items-center justify-center bg-[#171719] border border-white/10 shadow-[0_20px_80px_rgba(255,59,48,.16)] cursor-pointer active:scale-95 transition-all text-white ${activated ? 'ring-4 ring-emerald-500 animate-pulse' : ''}`}
      >
        {holding && (
          <span className="absolute inset-[-14px] rounded-full border border-[#ff3b30]/50 pointer-events-none" style={{transform:`scale(${.85+progress/300})`,opacity:1-progress/100}}/>
        )}
        <span
          className="absolute inset-3 rounded-full bg-[#ff3b30] shadow-[inset_0_2px_12px_rgba(255,255,255,.2),0_12px_45px_rgba(255,59,48,.3)] pointer-events-none"
          style={{background: activated ? '#30d158' : `conic-gradient(#ff3b30 ${progress}%, #21262d ${progress}% 100%)`}}
        />
        <span className="relative z-10 flex flex-col items-center text-white pointer-events-none">
          <Siren size={30} className={activated ? 'text-white' : ''} />
          <span className="mt-2 text-base sm:text-lg font-black tracking-[.14em] text-white">
            {activated ? 'ACTIVATED' : holding ? 'HOLDING…' : 'SOS'}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/90">
            {activated ? 'Broadcasting…' : holding ? `${Math.ceil((100-progress)/33)}s remaining` : '3-second hold'}
          </span>
        </span>
      </button>

      {cancelled && (
        <span className="mt-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-medium animate-fadeIn">
          Release detected · Hold cancelled
        </span>
      )}
      {activated && (
        <span className="mt-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono font-bold animate-pulse">
          SOS ACTIVATED — CONNECTING NETWORK
        </span>
      )}
    </div>
  );
}

export default function Home(){
  const [loading,setLoading]=useState(false);
  const [gpsStatus,setGpsStatus]=useState<'prompt'|'requesting'|'ready'|'denied'>('prompt');

  useEffect(()=>{
    if('serviceWorker'in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
    if('permissions' in navigator){
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(res=>{
        if(res.state==='granted'){
          navigator.geolocation?.getCurrentPosition(()=>setGpsStatus('ready'),()=>setGpsStatus('denied'));
        }
      }).catch(()=>{});
    }
  },[]);

  const requestGps=()=>{
    setGpsStatus('requesting');
    if(!navigator.geolocation){ setGpsStatus('denied'); return; }
    navigator.geolocation.getCurrentPosition(
      ()=>setGpsStatus('ready'),
      ()=>setGpsStatus('denied'),
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const goToManual = () => {
    setLoading(true);
    localStorage.setItem('emefast_role', 'USER');
    location.href = '/user/emergency/new';
  };

  const triggerInstantSOS = async () => {
    setLoading(true);
    localStorage.setItem('emefast_role', 'USER');

    let latitude: number | null = null;
    let longitude: number | null = null;
    let address = "";

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const pos = await Promise.race([
          new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 2500,
              maximumAge: 10000,
            });
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 2500)),
        ]);
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        address = `Device GPS location (±${Math.round(pos.coords.accuracy)}m)`;
      } catch {
        latitude = null;
        longitude = null;
      }
    }

    // Never guess or fabricate coordinates. If GPS fails or is denied, redirect immediately to manual pin (Step 1)
    if (latitude == null || longitude == null) {
      location.href = '/user/emergency/new?gps=denied';
      return;
    }

    try {
      const cleanAddress = `Current device location (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°)`;
      const res = await api.post("/emergency/new", {
        patient_name: "Unknown Patient",
        condition: "Immediate medical assistance requested",
        priority: "CRITICAL",
        requirements: "Emergency stabilization",
        latitude,
        longitude,
        address: cleanAddress,
        transport_mode: "AMBULANCE",
      });

      const caseId = res.data.id;
      if (typeof window !== "undefined") {
        localStorage.setItem("emefast_current_case_id", String(caseId));
      }
      location.href = `/user/hospitals?case_id=${caseId}`;
    } catch {
      location.href = '/user/emergency/new';
    }
  };

  return <main className="min-h-screen landing-page text-[var(--text)] pt-[env(safe-area-inset-top,0px)] pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
    {/* Prominent Decision-Support Boundary Notice */}
    <aside aria-label="Emergency Services Notice" className="w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-center text-xs font-medium">
      <span>Decision-support only. EMEFast does not dispatch ambulances. 108 / 112 remain the official emergency numbers.</span>
    </aside>

   <header className="topnav px-4 sm:px-8 py-3 sm:py-4">
     <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
       <Link href="/" className="flex items-center gap-2.5 sm:gap-3 min-w-0">
         <Image
           src="/app-logo.png"
           alt="EMEFast Logo"
           width={38}
           height={38}
           priority
           className="rounded-[11px] shrink-0 shadow-[0_6px_20px_rgba(255,59,48,.3)]"
         />
         <div className="min-w-0">
           <b className="text-base tracking-tight block">EMEFast</b>
           <span className="hidden sm:block text-[10px] text-[var(--muted)] tracking-wider truncate">EMERGENCY MEDICAL COORDINATION</span>
         </div>
       </Link>
       <div className="flex items-center gap-2 shrink-0">
         <Link href="/login" className="glass px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full text-xs font-semibold whitespace-nowrap min-h-[44px] flex items-center justify-center">
           Sign In
         </Link>
         <button onClick={goToManual} disabled={loading} className="sos-btn px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs flex gap-1.5 sm:gap-2 items-center whitespace-nowrap min-h-[44px]">
           <Siren size={14} className="shrink-0"/>
           <span>{loading?'Starting…':'Start Emergency'}</span>
         </button>
       </div>
     </div>
   </header>
   
   <div className="status-ticker px-4 sm:px-8 py-2.5 sm:py-3">
     <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
       <div className="status-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-neutral-300 font-medium text-[11px] sm:text-xs">
         <span className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
         <span>Network online</span>
       </div>
       <div className="status-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-neutral-300 font-medium text-[11px] sm:text-xs" title="A system administrator has marked the facility as verified in the hospital registry. Criteria are set by the pilot administrator. Not clinical accreditation or statutory certification.">
         <CheckCircle2 size={13} className="text-[#30d158]" />
         <span>Admin-verified hospitals</span>
       </div>
       <div className="status-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-neutral-300 font-medium text-[11px] sm:text-xs">
         <Activity size={13} className="text-[#64d2ff]" />
         <span>Hospital-reported capacity</span>
       </div>
       {gpsStatus === 'ready' ? (
         <div className="status-pill status-pill-gps inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#30d158]/10 border border-[#30d158]/25 text-[#30d158] font-medium text-[11px] sm:text-xs">
           <MapPin size={13} />
           <span>GPS locked · Precise</span>
         </div>
       ) : gpsStatus === 'requesting' ? (
         <div className="status-pill status-pill-gps inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ff9f0a]/10 border border-[#ff9f0a]/25 text-[#ff9f0a] font-medium text-[11px] sm:text-xs">
           <Activity size={13} className="spin" />
           <span>Acquiring GPS location…</span>
         </div>
       ) : (
         <button
           onClick={requestGps}
           className="status-pill status-pill-btn inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.09] border border-white/15 text-neutral-200 font-medium transition-colors cursor-pointer active:scale-95 text-[11px] sm:text-xs min-h-[36px]"
         >
           <MapPin size={13} className="text-[#ff9f0a]" />
           <span>{gpsStatus === 'denied' ? 'Location needed (Retry)' : 'Enable precise location'}</span>
         </button>
       )}
       <div className="w-full text-[11px] text-[var(--muted)] pt-0.5 flex items-center gap-1.5">
         <span className="text-white/80 font-semibold">Admin-verified:</span>
         <span>A system administrator has marked the facility as verified in the hospital registry. Criteria are set by the pilot administrator. Not clinical accreditation or statutory certification.</span>
       </div>
     </div>
   </div>

   <section className="max-w-6xl mx-auto px-4 sm:px-8 pt-8 sm:pt-16 lg:pt-20 pb-12 sm:pb-14 grid lg:grid-cols-[1.1fr_.9fr] gap-8 sm:gap-12 items-center">
    <div>
      <div className="badge-red px-3 py-1.5 text-[10px] font-semibold tracking-widest mb-4 sm:mb-5 inline-block">EMERGENCY COORDINATION NETWORK</div>
      <h1 className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-.04em] sm:tracking-[-.055em] leading-[1.05] sm:leading-[.95]">
        Seconds matter.<br/><span className="text-[#ff453a]">We coordinate.</span>
      </h1>
      <p className="mt-4 sm:mt-6 max-w-xl text-[var(--muted)] text-base sm:text-lg leading-relaxed">
        Initiate an emergency request in seconds, evaluate hospital capability matches, and alert receiving emergency departments before patient arrival.
      </p>
      <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Link href="/ambulance/emergency/new" className="glass px-5 py-3 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 min-h-[44px] transition-colors border border-white/15 hover:border-white/30 text-[var(--text)]">
          Start emergency intake manually (4-step wizard) <ArrowRight size={15}/>
        </Link>
        <Link href="/ambulance/dashboard" className="text-xs text-[var(--muted)] hover:text-[var(--text)] inline-flex items-center justify-center gap-1.5 py-2 px-3 transition-colors underline-offset-4 hover:underline">
          Ambulance crew? Open Ambulance Workspace →
        </Link>
      </div>
      <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-[#30d158]"/>Emergency intake data collection</span>
        <span className="flex items-center gap-2"><MapPin size={15} className="text-[#ff9f0a]"/>GPS-assisted hospital recommendation</span>
      </div>
    </div>
    <div className="flex flex-col items-center justify-center py-4">
      <div className="badge-red px-3 py-1 text-[10px] font-bold tracking-widest mb-3 uppercase">PRIMARY EMERGENCY ACTION</div>
      <HoldSOS onComplete={triggerInstantSOS}/>
      <p className="mt-4 text-sm font-bold tracking-tight">Hold to trigger emergency SOS</p>
      <p className="mt-1 text-xs text-[var(--muted)] text-center max-w-xs px-2">Hold for 3 seconds to immediately create and broadcast a critical emergency request with device location. Release anytime before 3s to cancel.</p>
    </div>
   </section>

   <section className="max-w-6xl mx-auto px-4 sm:px-8 pb-12">
     <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
       <div className="v2-card p-5 sm:p-6 v2-card-hover">
         <Mic className="text-[#ff453a]"/>
         <h3 className="mt-4 sm:mt-5 font-semibold">Voice Intake</h3>
         <p className="mt-2 text-sm text-[var(--muted)]">Hindi + English audio recording with clinical dictation transcript.</p>
       </div>
       <div className="v2-card p-5 sm:p-6 v2-card-hover">
         <Hospital className="text-[#30d158]"/>
         <h3 className="mt-4 sm:mt-5 font-semibold">Hospital Capability Matching</h3>
         <p className="mt-2 text-sm text-[var(--muted)]">Compare facility capability, reported bed counts, ETA and hospital response instead of distance alone.</p>
       </div>
       <div className="v2-card p-5 sm:p-6 v2-card-hover sm:col-span-2 md:col-span-1">
         <Navigation className="text-[#64d2ff]"/>
         <h3 className="mt-4 sm:mt-5 font-semibold">Hospital Response Coordination</h3>
         <p className="mt-2 text-sm text-[var(--muted)]">Hospital acceptance responses, recommendation factors, and pre-arrival alerts in one view.</p>
       </div>
     </div>
   </section>

   <footer className="max-w-6xl mx-auto px-4 sm:px-8 py-6 border-t border-white/10 flex flex-col sm:flex-row gap-4 justify-between items-center text-[11px] text-[#8e8e93]">
     <span>EMEFast · Emergency Medical Coordination System</span>
     <div className="flex items-center gap-6">
       <Link href="/privacy" className="hover:text-neutral-200 underline underline-offset-4 transition-colors min-h-[36px] flex items-center">
         Privacy & Consent Disclosure
       </Link>
       <span className="flex items-center gap-2"><Phone size={12}/> 108 / 112</span>
     </div>
   </footer>
  </main>
}
