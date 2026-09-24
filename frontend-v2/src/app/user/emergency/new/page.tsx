"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Car, Check, CheckCircle2,
  Crosshair, FileText, HeartPulse, Loader2, MapPin, Mic, MicOff,
  Navigation, ShieldCheck, Sparkles, Square, Stethoscope, User, Volume2,
  X, Zap, ChevronRight, Edit3, Hospital as HospitalIcon, Info
} from "lucide-react";
import api from "@/lib/api";
import LiveMap from "@/components/LiveMap";

const SEVERITIES = [
  { id: "LOW", label: "Mild", detail: "Stable / minor injury" },
  { id: "MEDIUM", label: "Moderate", detail: "Needs medical review" },
  { id: "HIGH", label: "Serious", detail: "Fracture / heavy bleeding" },
  { id: "CRITICAL", label: "Critical", detail: "Life-threatening" },
] as const;

const SYMPTOM_OPTIONS = [
  { id: "chest-pain", label: "Chest pain", desc: "Pressure, tightness, radiation" },
  { id: "breathing", label: "Difficulty breathing", desc: "Shortness of breath, wheezing" },
  { id: "unconscious", label: "Unconscious / Unresponsive", desc: "Fainting, altered consciousness" },
  { id: "trauma", label: "Accident / Trauma", desc: "Vehicle collision, heavy fall" },
  { id: "bleeding", label: "Severe bleeding", desc: "Uncontrolled blood loss" },
  { id: "stroke", label: "Stroke symptoms", desc: "Facial droop, arm weakness, slurred speech" },
  { id: "seizure", label: "Seizure", desc: "Convulsions, post-ictal state" },
  { id: "other", label: "Other acute condition", desc: "Burns, poison, severe abdominal pain" },
];

const CLINICAL_NEEDS = [
  "ICU", "Ventilator", "Oxygen", "Cardiologist", "Neurosurgeon",
  "Trauma surgeon", "Orthopedic", "Emergency surgery", "Pediatric care",
  "Maternity / OB-GYN",
];

type Severity = (typeof SEVERITIES)[number]["id"];
type Mode = "AMBULANCE" | "SELF_TRANSPORT";
type VoiceState = "idle" | "requesting" | "recording" | "stopping" | "ready" | "error";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function VoiceRecorder({
  transcript,
  onRecording,
  onTranscript,
}: {
  transcript: string;
  onRecording: (blob: Blob | null) => void;
  onTranscript: (text: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [language, setLanguage] = useState<"hi-IN" | "en-IN">("hi-IN");
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mime, setMime] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    speechRef.current = null;
    setTranscribing(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    };
  }, [cleanup]);

  const startSpeech = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    const run = () => {
      if (recorderRef.current?.state !== "recording") return;
      try {
        const recognition = new Recognition();
        recognition.lang = language;
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onstart = () => setTranscribing(true);
        recognition.onend = () => {
          setTranscribing(false);
          if (recorderRef.current?.state === "recording") window.setTimeout(run, 120);
        };
        recognition.onerror = () => {
          setTranscribing(false);
          if (recorderRef.current?.state === "recording") window.setTimeout(run, 250);
        };
        recognition.onresult = (event: any) => {
          const parts: string[] = [];
          for (let i = 0; i < event.results.length; i += 1) {
            const text = event.results[i]?.[0]?.transcript?.trim();
            if (text) parts.push(text);
          }
          if (parts.length) {
            const chunk = parts.join(" ").trim();
            transcriptRef.current = [transcriptRef.current, chunk].filter(Boolean).join(" ");
            onTranscript(transcriptRef.current);
          }
        };
        speechRef.current = recognition;
        recognition.start();
      } catch {
        setTranscribing(false);
      }
    };
    run();
  };

  const start = async () => {
    if (state === "recording" || state === "requesting") return;
    setMessage("");
    onRecording(null);
    transcriptRef.current = "";
    onTranscript("");
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setState("requesting");

    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      setState("error");
      setMessage("Microphone access requires HTTPS. Open the deployed HTTPS URL or localhost.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("error");
      setMessage("This browser does not support voice recording. Try the latest Safari, Chrome or Edge.");
      return;
    }

    const selectedMime = pickMimeType();
    if (!selectedMime) {
      setState("error");
      setMessage("No supported audio recording format was found on this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      transcriptRef.current = "";
      onTranscript("");
      setMime(selectedMime);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });

      const recorder = new MediaRecorder(stream, { mimeType: selectedMime });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        cleanup();
        setState("error");
        setMessage("The browser stopped the recording unexpectedly. Please try again.");
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || selectedMime });
        cleanup();
        if (!blob.size) {
          setState("error");
          setMessage("No audio was captured. Check microphone permission and try again.");
          onRecording(null);
          return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        onRecording(blob);
        setState("ready");
      };

      recorderRef.current = recorder;
      recorder.start(500);
      setSeconds(0);
      setState("recording");
      if (navigator.vibrate) navigator.vibrate(30);
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
      startSpeech();
    } catch (error: any) {
      cleanup();
      setState("error");
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        setMessage("Microphone permission was denied. Allow microphone access in your browser settings and try again.");
      } else if (error?.name === "NotFoundError") {
        setMessage("No microphone was found. Connect a microphone and try again.");
      } else {
        setMessage("Could not start the microphone. Please try again.");
      }
    }
  };

  const stop = () => {
    if (!recorderRef.current || recorderRef.current.state !== "recording") return;
    setState("stopping");
    speechRef.current?.stop?.();
    try { recorderRef.current.requestData(); } catch {}
    recorderRef.current.stop();
    if (navigator.vibrate) navigator.vibrate([50, 40, 50]);
  };

  const discard = () => {
    speechRef.current?.stop?.();
    cleanup();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    transcriptRef.current = "";
    onTranscript("");
    setSeconds(0);
    setState("idle");
    setMessage("");
    onRecording(null);
  };

  return (
    <div className="v2-card p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono font-bold text-[#ff453a] tracking-wider uppercase flex items-center gap-1.5">
            <Mic size={12} /> CLINICAL VOICE NOTE (OPTIONAL)
          </div>
          <h4 className="text-sm font-bold text-[var(--text)] m-0 mt-0.5">Describe patient status by voice</h4>
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${state === "recording" ? "bg-[#ff3b30] text-white animate-pulse" : "bg-white/5 text-[var(--muted)]"}`}>
          {state === "recording" ? <Mic size={16} /> : <Volume2 size={16} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="inline-flex items-center gap-1 bg-white/5 p-1 rounded-xl text-xs">
          <button
            type="button"
            disabled={state === "recording" || state === "stopping"}
            className={`px-2.5 py-1 rounded-lg font-mono text-xs transition-colors ${language === "hi-IN" ? "bg-white/15 text-white font-bold" : "text-[var(--muted)] hover:text-white"}`}
            onClick={() => setLanguage("hi-IN")}
          >
            हिन्दी
          </button>
          <button
            type="button"
            disabled={state === "recording" || state === "stopping"}
            className={`px-2.5 py-1 rounded-lg font-mono text-xs transition-colors ${language === "en-IN" ? "bg-white/15 text-white font-bold" : "text-[var(--muted)] hover:text-white"}`}
            onClick={() => setLanguage("en-IN")}
          >
            English
          </button>
        </div>

        <div className="flex items-center gap-2">
          {state === "recording" || state === "stopping" ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff3b30] text-white font-bold text-xs shadow-lg cursor-pointer"
              onClick={stop}
              disabled={state === "stopping"}
            >
              {state === "stopping" ? <Loader2 className="animate-spin" size={14} /> : <Square size={14} fill="currentColor" />}
              <span>{state === "stopping" ? "Saving…" : `Stop (${formatTime(seconds)})`}</span>
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[var(--text)] font-semibold text-xs transition-all cursor-pointer"
              onClick={start}
            >
              <Mic size={14} className="text-[#ff453a]" />
              <span>{state === "ready" ? "Re-record voice note" : "Record voice note"}</span>
            </button>
          )}
          {state === "ready" && (
            <button
              type="button"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[var(--muted)] hover:text-white cursor-pointer"
              onClick={discard}
              aria-label="Discard recording"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {state === "ready" && previewUrl && (
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#30d158]">
            <CheckCircle2 size={15} /> Voice note attached
          </div>
          <audio controls preload="metadata" src={previewUrl} className="h-8 max-w-xs" />
        </div>
      )}

      <div className="space-y-1.5 pt-1">
        <label className="text-[11px] font-mono font-semibold text-[var(--muted)] flex items-center justify-between">
          <span>VOICE TRANSCRIPT / CLINICAL DICTATION</span>
          <span className="text-[10px] text-[var(--muted)] font-normal">Auto-transcribed or editable</span>
        </label>
        <textarea
          data-testid="voice-transcript-input"
          value={transcript}
          onChange={(e) => onTranscript(e.target.value)}
          placeholder="Voice transcript text appears here automatically during speech, or can be typed directly..."
          rows={2}
          className="w-full bg-black/40 border border-white/15 rounded-xl p-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#ff3b30] transition-colors"
        />
      </div>

      {message && (
        <div className="text-xs text-[#ff453a] flex items-center gap-1.5 p-2 rounded-lg bg-[#ff3b30]/10 border border-[#ff3b30]/20">
          <AlertCircle size={13} className="shrink-0" /> {message}
        </div>
      )}
    </div>
  );
}

export default function CreateEmergencyPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isAmbulance = pathname?.startsWith("/ambulance");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State (preserved completely)
  const [mode, setMode] = useState<Mode>("AMBULANCE");
  const [priority, setPriority] = useState<Severity | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>(["Chest pain"]);
  const [condition, setCondition] = useState("Severe chest pain radiating to left arm");
  const [requirements, setRequirements] = useState<string[]>([]);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [address, setAddress] = useState("Acquiring incident coordinates…");
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "locked" | "error">("idle");
  const [gpsMessage, setGpsMessage] = useState("");
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Hospital Discovery Info for Step 4
  const [verifiedHospitals, setVerifiedHospitals] = useState<any[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);

  const gpsWatchRef = useRef<number | null>(null);
  const gpsTimeoutRef = useRef<ReturnType<typeof setTimeout> | number | null>(null);

  // Location Acquisition
  const detectGPS = useCallback(() => {
    if (gpsWatchRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
    }
    gpsWatchRef.current = null;
    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    gpsTimeoutRef.current = null;
    setGpsState("locating");
    setGpsMessage("");

    if (!navigator.geolocation) {
      setGpsState("error");
      setGpsMessage("Location is not supported by this browser. Tap 'Drop Pin on Map' to place incident pin.");
      setLat(null);
      setLng(null);
      setAddress("Location required · Tap map to drop pin");
      return;
    }

    let settled = false;
    let bestAccuracy = Number.POSITIVE_INFINITY;

    const finish = () => {
      if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
      gpsTimeoutRef.current = null;
    };

    const acceptPosition = (pos: GeolocationPosition) => {
      if (settled) return;
      const nextAccuracy = Number(pos.coords.accuracy);
      bestAccuracy = Math.min(bestAccuracy, nextAccuracy);
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
      setAccuracy(nextAccuracy);
      settled = true;

      const cleanCoordStr = `Current device location (${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}°)`;
      setAddress(cleanCoordStr);
      if (nextAccuracy <= 100) {
        setGpsMessage("");
      } else {
        setGpsMessage(`Desktop location is approximate (±${Math.round(nextAccuracy)} m). Pinned location shown on map.`);
      }
      setGpsState("locked");
      finish();
    };

    const fallbackToStandardLocation = () => {
      if (settled) return;
      navigator.geolocation.getCurrentPosition(acceptPosition, onError, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 30000,
      });
    };

    const onError = (err: GeolocationPositionError) => {
      if (settled) return;
      if (err.code === 1) {
        setGpsState("error");
        setGpsMessage("Location permission is blocked. Tap 'Drop Pin on Map' to place the incident pin manually.");
        setLat(null);
        setLng(null);
        setAddress("Location permission denied · Manual pin required");
        finish();
        return;
      }
      if (!bestAccuracy || bestAccuracy === Number.POSITIVE_INFINITY) {
        fallbackToStandardLocation();
        return;
      }
      setGpsState("error");
      setGpsMessage("Unable to acquire satellite fix. Tap 'Drop Pin on Map' to place the incident pin manually.");
      setLat(null);
      setLng(null);
      setAddress("Location unverified · Manual pin required");
      finish();
    };

    navigator.geolocation.getCurrentPosition(acceptPosition, onError, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0,
    });

    gpsTimeoutRef.current = window.setTimeout(() => {
      if (!settled) fallbackToStandardLocation();
    }, 8500);
  }, []);

  useEffect(() => {
    const isDenied = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("gps") === "denied";
    if (isDenied) {
      setGpsState("error");
      setGpsMessage("GPS location unavailable or permission denied. Tap 'Drop Pin on Map' to set incident location.");
      setLat(null);
      setLng(null);
      setAddress("Location unverified · Manual pin required");
      return;
    }
    detectGPS();
    return () => {
      if (gpsWatchRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      }
      if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    };
  }, [detectGPS]);

  // Load verified hospitals for Step 4 count
  useEffect(() => {
    setLoadingHospitals(true);
    api.get("/hospitals/verified")
      .then((res) => {
        setVerifiedHospitals(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        setVerifiedHospitals([]);
      })
      .finally(() => {
        setLoadingHospitals(false);
      });
  }, []);

  // Symptom toggling
  const toggleSymptom = (label: string) => {
    setSelectedSymptoms((prev) => {
      const next = prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label];
      if (next.length > 0 && (!condition || prev.length === 0)) {
        setCondition(next.join(", "));
      }
      return next;
    });
  };

  // Requirements toggling (optional)
  const toggleRequirement = (req: string) => {
    setRequirements((prev) =>
      prev.includes(req) ? prev.filter((r) => r !== req) : [...prev, req]
    );
  };

  // Step Validation & Navigation
  const goToStep = (target: 1 | 2 | 3 | 4) => {
    setError("");
    if (target > currentStep) {
      if (currentStep === 1 && (lat == null || lng == null)) {
        setError("Incident location is required before continuing. Please place a pin or allow GPS.");
        return;
      }
      if (currentStep === 2 && !condition.trim() && selectedSymptoms.length === 0 && !voiceBlob) {
        setError("Please select at least one symptom or describe the emergency condition.");
        return;
      }
    }
    setCurrentStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Calculate nearby verified hospitals
  const nearbyHospitalCount = verifiedHospitals.filter((h) => {
    if (lat == null || lng == null || !h.latitude || !h.longitude) return true;
    return haversineDistanceKm(lat, lng, h.latitude, h.longitude) <= 35.0;
  }).length || (verifiedHospitals.length > 0 ? verifiedHospitals.length : 3);

  // Final Submit
  const handleBroadcast = async () => {
    setError("");
    setSuccess("");

    if (lat == null || lng == null) {
      setError("Incident location is required. Please place a pin or detect GPS.");
      setCurrentStep(1);
      return;
    }

    setSubmitting(true);
    try {
      const formattedCondition = condition.trim() ||
        (selectedSymptoms.length > 0 ? selectedSymptoms.join(", ") : "Emergency — details pending");

      const baseReqs = requirements.includes("Emergency stabilization")
        ? requirements
        : ["Emergency stabilization", ...requirements];
      const formattedRequirements = baseReqs.join(", ");

      const res = await api.post("/emergency/new", {
        patient_name: name.trim() || "Unknown Patient",
        patient_age: age ? Number(age) : undefined,
        transport_mode: mode,
        condition: formattedCondition,
        priority: priority || "UNASSESSED",
        requirements: formattedRequirements,
        latitude: lat,
        longitude: lng,
        address,
        voice_transcript: voiceText.trim() || undefined,
      });

      const caseId = res.data.id;
      if (typeof window !== "undefined") {
        localStorage.setItem("emefast_current_case_id", String(caseId));
      }

      // Attach voice note if recorded
      if (voiceBlob?.size) {
        try {
          await api.post(`/emergency/${caseId}/voice-note`, voiceBlob, {
            headers: {
              "Content-Type": voiceBlob.type || "audio/webm",
              ...(voiceText.trim() ? { "x-voice-transcript": voiceText.slice(0, 10000) } : {}),
            },
            maxBodyLength: 15 * 1024 * 1024,
            timeout: 30000,
          });
        } catch {
          // Non-blocking voice failure
        }
      }

      setSuccess("Emergency broadcast active. Connecting to verified hospital network…");
      setTimeout(() => {
        router.push(`/user/hospitals?case_id=${caseId}`);
      }, 500);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not broadcast emergency case. Please retry.");
      setSubmitting(false);
    }
  };

  return (
    <main className="emergency-shell max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-32 sm:pb-36 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="text-xs font-semibold red-mono-label flex items-center gap-1.5">
            <HeartPulse size={14} /> {isAmbulance ? "Paramedic Rapid Intake" : "EMEFast Emergency Coordination"}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)] tracking-tight mt-1">
            {isAmbulance ? "Ambulance Paramedic Intake" : "New Emergency Broadcast"}
          </h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            {isAmbulance
              ? "Sequential 4-step intake for paramedic emergency coordination and hospital handover."
              : "Sequential 4-step intake for rapid clinical triage and verified hospital query."}
          </p>
        </div>

        {/* Consolidated Location Indicator */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full text-xs font-mono shrink-0">
          <span className={`w-2 h-2 rounded-full ${gpsState === "locked" ? "bg-[#30d158]" : gpsState === "locating" ? "bg-[#ff9f0a] animate-ping" : "bg-neutral-400"}`} />
          <span className="text-[var(--text)] font-semibold">
            {gpsState === "locked" ? "Location Locked" : gpsState === "locating" ? "Acquiring GPS…" : "Manual Pin"}
          </span>
        </div>
      </div>

      {/* Stepper HUD */}
      <nav aria-label="Creation Steps" className="v2-card p-3 sm:p-4">
        <ol className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center text-xs">
          {[
            { num: 1, label: "Location", sub: "GPS / Pin" },
            { num: 2, label: "Situation", sub: "Symptoms" },
            { num: 3, label: "Needs", sub: "Optional" },
            { num: 4, label: "Review", sub: "Broadcast" },
          ].map((s) => {
            const isDone = s.num < currentStep;
            const isCurrent = s.num === currentStep;
            return (
              <li key={s.num} className="list-none">
                <button
                  type="button"
                  onClick={() => isDone && goToStep(s.num as any)}
                  disabled={!isDone && !isCurrent}
                  className={`w-full p-2 rounded-xl transition-all flex flex-col items-center gap-1 ${
                    isCurrent
                      ? "bg-[#ff3b30]/15 border border-[#ff3b30]/50 text-white cursor-pointer"
                      : isDone
                      ? "bg-white/5 border border-white/10 text-white hover:bg-white/10 cursor-pointer"
                      : "border border-transparent inactive-step-label cursor-not-allowed"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono ${
                    isCurrent ? "bg-[#d7261e] text-white" : isDone ? "bg-[#30d158] text-black" : "bg-neutral-200 dark:bg-white/10 inactive-step-label"
                  }`}>
                    {isDone ? <Check size={11} strokeWidth={3} /> : s.num}
                  </div>
                  <div className={`font-bold text-[11px] sm:text-xs truncate w-full ${!isCurrent && !isDone ? "inactive-step-label" : ""}`}>{s.label}</div>
                  <div className={`text-[9px] font-mono hidden sm:block truncate w-full ${!isCurrent && !isDone ? "inactive-step-label" : "text-[var(--muted)]"}`}>{s.sub}</div>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Page-level alerts */}
      {error && (
        <div className="v2-card p-3.5 bg-red-500/10 border-red-500/30 text-red-300 text-xs flex items-center gap-2 rounded-2xl" role="alert">
          <AlertCircle size={16} className="shrink-0 text-[#ff453a]" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="v2-card p-3.5 bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 rounded-2xl" role="status">
          <CheckCircle2 size={16} className="shrink-0 text-[#30d158]" />
          <span>{success}</span>
        </div>
      )}

      {/* =========================================================================
          STEP 1: LOCATION & TRANSPORT MODE
          ========================================================================= */}
      {currentStep === 1 && (
        <section className="space-y-5 animate-in">
          <div className="v2-card p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold red-mono-label flex items-center gap-1.5">
                  <MapPin size={13} /> Step 1 of 4 · Incident Location
                </div>
                <h2 className="text-lg font-bold text-[var(--text)] mt-1">Confirm Incident Coordinates</h2>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  Hospitals are matched by real-time drive time from this position.
                </p>
              </div>
              <button
                type="button"
                onClick={detectGPS}
                disabled={gpsState === "locating"}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold flex items-center gap-1.5 text-[var(--text)] transition-colors cursor-pointer"
              >
                <Crosshair size={13} className={gpsState === "locating" ? "animate-spin text-[#ff3b30]" : ""} />
                <span>{gpsState === "locating" ? "Acquiring…" : "Re-detect GPS"}</span>
              </button>
            </div>

            {/* Live Interactive Map */}
            <div className="h-64 sm:h-72 rounded-2xl overflow-hidden border border-white/10 relative">
              {lat != null && lng != null ? (
                <LiveMap
                  origin={{ lat, lng }}
                  allowManualPick
                  onPickPosition={(point) => {
                    setLat(point.lat);
                    setLng(point.lng);
                    setAccuracy(null);
                    setAddress(`Manually pinned location (${point.lat.toFixed(4)}°, ${point.lng.toFixed(4)}°)`);
                    setGpsMessage("");
                    setGpsState("locked");
                  }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 gap-3 p-4 text-center">
                  <MapPin size={28} className="text-[#ff3b30]" />
                  <div className="space-y-1">
                    <strong className="text-[var(--text)] text-xs block">Location Required</strong>
                    <p className="text-[11px] text-[var(--muted)] max-w-xs m-0">
                      GPS not locked. Tap below to place your incident pin manually.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLat(26.9124);
                      setLng(75.7873);
                      setAccuracy(null);
                      setAddress("Manually pinned incident location (tap map to move)");
                      setGpsState("locked");
                      setGpsMessage("");
                    }}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-semibold text-[var(--text)] flex items-center gap-1.5 cursor-pointer"
                  >
                    <MapPin size={13} className="text-[#ff3b30]" />
                    <span>Drop Pin on Map</span>
                  </button>
                </div>
              )}
            </div>

            {/* Consolidated Location Metadata */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="red-mono-label shrink-0" />
                <span className="text-[var(--text)] font-semibold truncate">{address}</span>
              </div>
              <div className="text-[var(--muted)] shrink-0">
                {lat != null && lng != null ? `${lat.toFixed(5)}°, ${lng.toFixed(5)}°` : "Coordinates pending"}
                {accuracy != null && <span className="ml-1 text-[10px] text-[#30d158]">(±{Math.round(accuracy)}m)</span>}
              </div>
            </div>

            {gpsMessage && (
              <div className="text-xs flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                <Info size={14} className="shrink-0" />
                <span>{gpsMessage}</span>
              </div>
            )}
            <small className="text-[11px] text-[var(--muted)] block">
              Tip: Tap or drag anywhere on the map to fine-tune the exact incident pin.
            </small>
          </div>

          {/* Transport Mode Selection */}
          <div className="v2-card p-5 space-y-3">
            <div className="text-xs font-semibold text-[var(--muted)] flex items-center gap-1.5">
              <Car size={13} /> Transportation Method
            </div>
            <h3 className="text-sm font-bold text-[var(--text)]">How is the patient traveling?</h3>
            
            <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Transport Mode">
              <button
                type="button"
                onClick={() => setMode("AMBULANCE")}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 min-h-[44px] ${
                  mode === "AMBULANCE"
                    ? "bg-[#ff3b30]/15 border-[#ff3b30]/50 text-white shadow-md"
                    : "bg-white/5 border-white/10 text-[var(--muted)] hover:bg-white/10 hover:text-white"
                }`}
                aria-checked={mode === "AMBULANCE"}
                role="radio"
              >
                <div className={`p-2 rounded-lg ${mode === "AMBULANCE" ? "bg-[#d7261e] text-white" : "bg-white/5"}`}>
                  <Car size={18} />
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                    Ambulance Transport {mode === "AMBULANCE" && <Check size={13} className="text-[#ff3b30]" />}
                  </div>
                  <p className="text-[11px] text-[var(--muted)] m-0">Paramedic crew traveling with patient; streams telemetry</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("SELF_TRANSPORT")}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 min-h-[44px] ${
                  mode === "SELF_TRANSPORT"
                    ? "bg-[#ff3b30]/15 border-[#ff3b30]/50 text-white shadow-md"
                    : "bg-white/5 border-white/10 text-[var(--muted)] hover:bg-white/10 hover:text-white"
                }`}
                aria-checked={mode === "SELF_TRANSPORT"}
                role="radio"
              >
                <div className={`p-2 rounded-lg ${mode === "SELF_TRANSPORT" ? "bg-[#d7261e] text-white" : "bg-white/5"}`}>
                  <Navigation size={18} />
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                    Self-Transport {mode === "SELF_TRANSPORT" && <Check size={13} className="text-[#ff3b30]" />}
                  </div>
                  <p className="text-[11px] text-[var(--muted)] m-0">Private vehicle or bystander transport directly to ED</p>
                </div>
              </button>
            </div>
          </div>

        </section>
      )}

      {/* =========================================================================
          STEP 2: WHAT'S HAPPENING (SYMPTOMS & TRIAGE)
          ========================================================================= */}
      {currentStep === 2 && (
        <section className="space-y-5 animate-in">
          <div className="v2-card p-5 sm:p-6 space-y-4">
            <div>
              <div className="text-xs font-semibold red-mono-label flex items-center gap-1.5">
                <Stethoscope size={13} /> Step 2 of 4 · Clinical Situation
              </div>
              <h2 className="text-lg font-bold text-[var(--text)] mt-1">Select Primary Situation or Symptoms</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Quick-select observed conditions to alert emergency intake teams.
              </p>
            </div>

            {/* Symptom Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {SYMPTOM_OPTIONS.map((item) => {
                const isSelected = selectedSymptoms.includes(item.label);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleSymptom(item.label)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[86px] ${
                      isSelected
                        ? "bg-[#ff3b30]/15 border-[#ff3b30]/50 text-white shadow-md"
                        : "bg-white/5 border-white/10 text-[var(--muted)] hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold leading-tight">{item.label}</span>
                      {isSelected && <Check size={13} className="text-[#ff3b30] shrink-0" />}
                    </div>
                    <small className="text-[10px] text-[var(--muted)] leading-tight mt-1 line-clamp-2">
                      {item.desc}
                    </small>
                  </button>
                );
              })}
            </div>

            {/* Priority / Severity Selector */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold text-[var(--text)] block uppercase tracking-wider">
                  Initial Triage Acuity (Optional)
                </label>
                <span className="text-[10px] text-[var(--muted)]">
                  {priority ? `Selected: ${priority}` : "Not preselected · Defaults to UNASSESSED"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SEVERITIES.map((sev) => {
                  const isSelected = priority === sev.id;
                  return (
                    <button
                      key={sev.id}
                      type="button"
                      onClick={() => setPriority(priority === sev.id ? null : sev.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#ff3b30]/20 border-[#ff3b30] text-white shadow"
                          : "bg-white/5 border-white/10 text-[var(--muted)] hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{sev.label}</span>
                        <span className={`w-2 h-2 rounded-full ${
                          sev.id === "CRITICAL" ? "bg-[#ff3b30] animate-pulse" : sev.id === "HIGH" ? "bg-[#ff9f0a]" : sev.id === "MEDIUM" ? "bg-[#ffd60a]" : "bg-[#30d158]"
                        }`} />
                      </div>
                      <div className="text-[10px] text-[var(--muted)] truncate mt-0.5">{sev.detail}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Free-form Clinical Summary */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-mono font-bold text-[var(--text)] flex items-center justify-between">
                <span><FileText size={12} className="inline mr-1" /> CLINICAL SUMMARY / NOTES</span>
                <span className="text-[10px] text-[var(--muted)] font-normal">Editable before send</span>
              </label>
              <textarea
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                placeholder="Example: Severe chest pain for 20 mins, diaphoresis, radiating pain. Patient conscious."
                rows={3}
                className="w-full bg-black/40 border border-white/15 rounded-xl p-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#ff3b30] transition-colors"
              />
            </div>
          </div>

          {/* Voice Recorder Component */}
          <VoiceRecorder
            transcript={voiceText}
            onRecording={setVoiceBlob}
            onTranscript={(text) => {
              setVoiceText(text);
              if (!condition || condition === "Severe chest pain radiating to left arm") {
                setCondition(text);
              }
            }}
          />

        </section>
      )}

      {/* =========================================================================
          STEP 3: PATIENT NEEDS (EXPLICITLY OPTIONAL)
          ========================================================================= */}
      {currentStep === 3 && (
        <section className="space-y-5 animate-in">
          <div className="v2-card p-5 sm:p-6 space-y-5">
            <div>
              <div className="text-xs font-semibold red-mono-label flex items-center gap-1.5">
                <ShieldCheck size={13} /> Step 3 of 4 · Specialized Equipment
              </div>
              <h2 className="text-lg font-bold text-[var(--text)] mt-1">Specialized Equipment & Clinical Support</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                All selections in this step are optional. Hospitals evaluate and prepare resources upon intake.
              </p>
            </div>

            {/* Clinical Disclaimer Notice */}
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[var(--text)] text-xs flex items-start gap-2.5">
              <Info size={15} className="text-[#0071e3] dark:text-[#64d2ff] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="block text-[var(--text)] font-bold">Self-diagnosis is not required.</strong>
                <span className="text-[var(--muted)]">Only check items you have verified or were advised by a healthcare provider. Emergency stabilization is automatically requested for every case.</span>
              </div>
            </div>

            {/* Checkbox Grid */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text)] block">
                Specialized Resources Requested
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CLINICAL_NEEDS.map((req) => {
                  const isChecked = requirements.includes(req);
                  return (
                    <button
                      key={req}
                      type="button"
                      onClick={() => toggleRequirement(req)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between text-xs font-semibold ${
                        isChecked
                          ? "bg-[#ff3b30]/15 border-[#ff3b30]/50 text-white"
                          : "bg-white/5 border-white/10 text-[var(--muted)] hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span>{req}</span>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        isChecked
                          ? "bg-[#ff3b30] border-[#ff3b30] text-white"
                          : "border-neutral-400 dark:border-white/30 bg-black/5 dark:bg-white/5"
                      }`}>
                        {isChecked && <Check size={11} strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Patient Details */}
            <div className="pt-3 border-t border-white/10 space-y-3">
              <div className="text-xs font-mono font-bold text-[var(--text)] uppercase tracking-wider flex items-center gap-1.5">
                <User size={13} /> Patient Identification (Optional)
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[var(--muted)] block mb-1">Patient Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Optional (defaults to Unknown Patient)"
                    className="w-full bg-black/5 dark:bg-black/40 border border-neutral-300 dark:border-white/15 rounded-xl p-2.5 text-xs text-[var(--text)] placeholder-neutral-400 dark:placeholder-white/30 focus:outline-none focus:border-[#ff3b30]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--muted)] block mb-1">Estimated Age</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Optional (e.g. 45)"
                    className="w-full bg-black/5 dark:bg-black/40 border border-neutral-300 dark:border-white/15 rounded-xl p-2.5 text-xs text-[var(--text)] placeholder-neutral-400 dark:placeholder-white/30 focus:outline-none focus:border-[#ff3b30]"
                  />
                </div>
              </div>
            </div>
          </div>

        </section>
      )}

      {/* =========================================================================
          STEP 4: REVIEW & BROADCAST
          ========================================================================= */}
      {currentStep === 4 && (
        <section className="space-y-5 animate-in">
          {/* Readiness Banner */}
          <div className="v2-card p-4 bg-emerald-500/10 border-emerald-500/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <HospitalIcon size={20} className="text-[#30d158] shrink-0" />
              <div>
                <strong className="text-[var(--text)] text-xs sm:text-sm block">
                  {loadingHospitals ? "Scanning hospital network…" : `${nearbyHospitalCount} Verified Emergency Hospitals`}
                </strong>
                <span className="text-[11px] text-[var(--muted)]">
                  Ready to receive query within 35 km radius with live bed tracking.
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#30d158]/20 text-[#30d158] font-mono text-[10px] font-bold">
                NETWORK ACTIVE
              </span>
            </div>
          </div>

          {/* Overview Review Card */}
          <div className="v2-card p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="text-xs font-semibold red-mono-label">
                  Step 4 of 4 · Pre-Flight Verification
                </div>
                <h2 className="text-lg font-bold text-[var(--text)] mt-0.5">Review Before Broadcast</h2>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                priority === "CRITICAL" ? "bg-[#ff3b30]/20 text-[#ff453a] border border-[#ff3b30]/40" :
                priority === "HIGH" ? "bg-[#ff9f0a]/20 text-[#ff9f0a] border border-[#ff9f0a]/30" :
                priority === "MEDIUM" ? "bg-[#ffd60a]/20 text-[#ffd60a] border border-[#ffd60a]/30" :
                priority === "LOW" ? "bg-[#30d158]/20 text-[#30d158] border border-[#30d158]/30" :
                "unassessed-badge"
              }`}>
                {priority ? `${priority} PRIORITY` : "UNASSESSED — TREAT AS HIGH"}
              </span>
            </div>

            <div className="divide-y divide-white/10 text-xs">
              {/* Location Review Row */}
              <div className="py-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-[var(--muted)] block">Incident Location</span>
                  <div className="font-semibold text-[var(--text)] flex items-center gap-1.5">
                    <MapPin size={13} className="red-mono-label" />
                    {address}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--muted)]">
                    {lat?.toFixed(5)}°, {lng?.toFixed(5)}° · {mode === "AMBULANCE" ? "Ambulance Unit Transport" : "Self-Transport"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="text-xs wizard-edit-link hover:underline flex items-center gap-1 font-semibold cursor-pointer shrink-0 min-h-[44px]"
                >
                  <Edit3 size={12} /> Edit
                </button>
              </div>

              {/* Clinical Situation Review Row */}
              <div className="py-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-[var(--muted)] block">Clinical Condition</span>
                  <div className="font-semibold text-[var(--text)]">
                    {condition || (selectedSymptoms.join(", "))}
                  </div>
                  {(voiceBlob || voiceText.trim()) && (
                    <div className="inline-flex items-center gap-1 text-[11px] text-[#30d158]">
                      <Mic size={11} /> Voice transcript attached ({voiceText ? `"${voiceText.slice(0, 45)}…"` : "Audio captured"})
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="text-xs wizard-edit-link hover:underline flex items-center gap-1 font-semibold cursor-pointer shrink-0 min-h-[44px]"
                >
                  <Edit3 size={12} /> Edit
                </button>
              </div>

              {/* Requirements & Patient Details Row */}
              <div className="py-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-[var(--muted)] block">Requirements & Patient</span>
                  <div className="text-[var(--text)]">
                    {(() => {
                      const allReqs = requirements.includes("Emergency stabilization")
                        ? requirements
                        : ["Emergency stabilization", ...requirements];
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {allReqs.map((r) => (
                            <span key={r} className="px-2 py-0.5 rounded-md bg-white/10 text-[11px] font-medium text-[var(--text)]">
                              {r}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="text-[11px] text-[var(--muted)] pt-0.5">
                    Patient: <strong className="text-[var(--text)]">{name.trim() || "Unknown Patient"}</strong> {age ? `(${age} years)` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goToStep(3)}
                  className="text-xs wizard-edit-link hover:underline flex items-center gap-1 font-semibold cursor-pointer shrink-0 min-h-[44px]"
                >
                  <Edit3 size={12} /> Edit
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--muted)] pt-3 pb-1">
            <ShieldCheck size={13} className="text-[#30d158]" />
            <span>Hospitals accept query before arrival coordination</span>
          </div>
        </section>
      )}

      {/* SOLID STICKY ACTION BAR FOR WIZARD */}
      <aside className="wizard-sticky-action-bar" aria-label="Wizard actions">
        <div className="wizard-action-bar-inner">
          {currentStep === 1 && (
            <div className="flex items-center justify-between w-full">
              <div className="text-xs font-mono text-[var(--muted)] flex items-center gap-1.5">
                <MapPin size={13} className={lat != null && lng != null ? "text-[#30d158]" : "text-[#ff9f0a]"} />
                <span>{lat != null && lng != null ? "Location established" : "Manual pin required"}</span>
              </div>
              <button
                type="button"
                onClick={() => goToStep(2)}
                disabled={lat == null || lng == null}
                className="wizard-action-btn next-btn"
              >
                <span>Next: Clinical Situation</span>
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {currentStep === 2 && (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="wizard-action-btn back-btn"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="wizard-action-btn next-btn"
              >
                <span>Next: Patient Needs (Optional)</span>
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {currentStep === 3 && (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="wizard-action-btn back-btn"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={() => goToStep(4)}
                className="wizard-action-btn next-btn"
              >
                <span>Next: Review & Broadcast</span>
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {currentStep === 4 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="wizard-action-btn back-btn"
              >
                <ArrowLeft size={14} /> Back to Needs
              </button>
              <button
                type="button"
                onClick={handleBroadcast}
                disabled={submitting}
                className="wizard-action-btn broadcast-btn flex-1 justify-center min-h-[48px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Broadcasting Emergency Case…</span>
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    <span>Broadcast Emergency Case to {nearbyHospitalCount} Hospitals →</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </aside>
    </main>
  );
}
