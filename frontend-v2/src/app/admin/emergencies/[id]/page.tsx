"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, Shield, AlertTriangle, CheckCircle2, Crosshair } from 'lucide-react';
import api from '@/lib/api';
import { EmergencyCase } from '@/types';
import { formatEnum } from '@/lib/format';

export default function AdminEmergencyDetail() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<EmergencyCase | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get(`/emergency/${id}`).then(r => setC(r.data)).catch(() => {});
    api.get(`/emergency/${id}/timeline`).then(r => setTimeline(r.data || [])).catch(() => {});
  }, [id]);

  if (!c) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="v2-card p-8">Loading emergency…</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
      <Link href="/admin/emergencies" className="back-link inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white">
        <ArrowLeft size={15} /> Back to live feed
      </Link>

      <section className="v2-card p-6 space-y-5">
        <div>
          <div className="eyebrow text-xs font-mono font-bold text-red-400">
            PERMANENT INCIDENT ID · {c.case_code}
          </div>
          <h1 className="text-2xl font-bold mt-2 text-white">{c.condition}</h1>
          <p className="text-sm opacity-70 text-neutral-300">
            {c.patient_name} {c.patient_age ? `(${c.patient_age} yrs)` : ''} · {formatEnum(c.priority)} · {formatEnum(c.status)}
          </p>
        </div>

        {c.override_reason && (
          <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-amber-400" />
            <div>
              <strong className="block text-amber-200">Manual Hospital Override Recorded</strong>
              <span>Reason: {c.override_reason}</span>
            </div>
          </div>
        )}

        <div className="detail-grid grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-neutral-500 block uppercase">Location</span>
            <strong className="text-neutral-200 flex items-center gap-1 mt-0.5">
              <MapPin size={13} className="text-red-400" />
              {c.address || `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`}
            </strong>
          </div>
          <div>
            <span className="text-neutral-500 block uppercase">Created</span>
            <strong className="text-neutral-200 flex items-center gap-1 mt-0.5">
              <Clock size={13} className="text-neutral-400" />
              {new Date(c.created_at).toLocaleString()}
            </strong>
          </div>
          <div>
            <span className="text-neutral-500 block uppercase">Requirement</span>
            <strong className="text-neutral-200 block mt-0.5">{c.requirements}</strong>
          </div>
          <div>
            <span className="text-neutral-500 block uppercase">Transport</span>
            <strong className="text-neutral-200 block mt-0.5">{formatEnum(c.transport_mode)}</strong>
          </div>
        </div>

        {/* GPS State & Provenance HUD */}
        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5 text-xs font-mono">
          <div className="text-[10px] text-neutral-400 uppercase font-bold flex items-center gap-1">
            <Crosshair size={12} className="text-emerald-400" /> Incident GPS Provenance
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-neutral-300">
            <div>Coordinates: <span className="text-white font-semibold">{c.latitude.toFixed(5)}°, {c.longitude.toFixed(5)}°</span></div>
            <div>Source: <span className="text-white font-semibold">{c.gps_source || 'DEVICE'}</span></div>
            <div>Accuracy: <span className="text-white font-semibold">{(c.stored_accuracy ?? c.gps_accuracy) != null ? `±${Math.round((c.stored_accuracy ?? c.gps_accuracy)!)}m` : 'Manual'}</span></div>
            <div>Timestamp: <span className="text-white font-semibold">{c.stored_timestamp ? new Date(c.stored_timestamp).toLocaleTimeString() : 'Recorded'}</span></div>
          </div>
        </div>
      </section>

      {/* Hospital Responses */}
      {c.responses && c.responses.length > 0 && (
        <section className="v2-card p-6 space-y-3">
          <h2 className="text-base font-bold text-white">Hospital Responses ({c.responses.length})</h2>
          <div className="space-y-2">
            {c.responses.map(r => (
              <div key={r.id} className="p-3 rounded-lg border border-neutral-700/40 bg-neutral-900/50 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2 font-bold text-white">
                    <span>{r.hospital_name || `Hospital #${r.hospital_id}`}</span>
                    {Boolean(r.simulated) && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                        SIMULATED
                      </span>
                    )}
                  </div>
                  <p className="text-neutral-400 mt-0.5">
                    {r.distance_km != null ? `${r.distance_km} km` : ''}
                    {r.eta != null ? ` · ${r.eta} min ETA` : ''}
                    {r.rejection_reason ? ` · Reason: ${r.rejection_reason}` : ''}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                  r.response === 'ACCEPTED' || r.response === 'SELECTED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : r.response === 'REJECTED'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {r.response}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Authoritative Incident Timeline */}
      <section className="v2-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Clock size={16} className="text-blue-400" /> Authoritative Event Timeline
          </h2>
          <span className="text-xs font-mono text-neutral-400">{timeline.length} events</span>
        </div>
        {timeline.length === 0 ? (
          <p className="text-xs text-neutral-400">No events recorded in audit log yet.</p>
        ) : (
          <div className="space-y-3 border-l-2 border-neutral-700 pl-4 ml-1">
            {timeline.map((evt: any, i: number) => (
              <div key={evt.id || i} className="text-xs space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-blue-300 font-bold">{evt.action}</span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '—'}
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-white/10 text-[9px] font-mono text-neutral-300">
                    {evt.performed_by || 'SYSTEM'}
                  </span>
                </div>
                <p className="text-neutral-300 m-0 leading-relaxed">{evt.details}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
