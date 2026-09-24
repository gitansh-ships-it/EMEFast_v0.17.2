"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Radio, Clock, MapPin, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { EmergencyCase } from '@/types';
import { formatEnum } from '@/lib/format';

export default function AdminEmergenciesPage() {
  const [cases, setCases] = useState<EmergencyCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCases();
    const interval = setInterval(fetchCases, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchCases = async () => {
    try {
      const res = await api.get('/admin/emergencies');
      setCases(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <div className="eyebrow red flex items-center gap-1.5 mb-1.5">
          <Radio size={13} className="animate-pulse" /> Live Emergency Feed
        </div>
        <h1 className="page-title">Live Emergency Stream</h1>
        <p className="page-subtitle mt-1">State-wide real-time emergency case monitoring</p>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-[#161b22] border border-[#21262d] text-xs font-mono">
        <span className="text-ok-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-ok-400 animate-pulse-dot inline-block" />
          {cases.filter(c => c.status === 'BROADCASTING').length} Query Active
        </span>
        <span className="text-[#484f58]">|</span>
        <span className="text-warn-300">{cases.filter(c => c.status === 'HOSPITAL_SELECTED').length} Hospital Selected</span>
        <span className="text-[#484f58]">|</span>
        <span className="text-[#8b949e]">{cases.length} Total Today</span>
      </div>

      {loading ? (
        <div className="v2-card p-8 text-center text-xs text-[#6e7681] font-mono">
          <Radio className="w-6 h-6 animate-spin mx-auto mb-2 text-sos-400" />
          Loading emergency stream...
        </div>
      ) : cases.length === 0 ? (
        <div className="v2-card p-10 text-center space-y-2">
          <AlertTriangle size={28} className="mx-auto text-[#484f58]" />
          <p className="text-sm text-[#6e7681]">No emergencies in stream.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map(c => (
            <Link href={`/admin/emergencies/${c.id}`} key={c.id} className={`v2-card v2-card-hover p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
              c.status === 'BROADCASTING' ? 'border-l-2 border-sos-400' : ''
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                  c.priority === 'CRITICAL' ? 'bg-sos-400/15 text-sos-300 border border-sos-400/30' :
                  c.priority === 'HIGH' ? 'bg-warn-400/15 text-warn-300 border border-warn-400/30' :
                  'bg-[#21262d] text-[#8b949e] border border-[#30363d]'
                }`}>
                  {c.priority.charAt(0)}
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-[#6e7681]">{c.case_code}</span>
                    <span className="font-bold text-white text-xs">{c.patient_name}</span>
                    <span className="text-sos-300 text-xs">— {c.condition}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[#484f58]">
                    <Clock size={10} /> {new Date(c.created_at).toLocaleTimeString()}
                    <MapPin size={10} /> {c.address || (c.latitude ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}` : 'Coordinates pending')}
                  </div>
                  <div className="text-[11px] text-[#6e7681]">
                    {c.responses?.filter(r => r.response === 'ACCEPTED').length || 0} Accepted · {c.responses?.length || 0} Responded
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  c.status === 'COMPLETED' ? 'badge-green' :
                  c.status === 'HOSPITAL_SELECTED' ? 'badge-blue' :
                  c.status === 'HOSPITAL_ACCEPTED' ? 'badge-green' :
                  c.status === 'BROADCASTING' ? 'badge-red' :
                  c.status === 'WAITING_FOR_RESPONSES' || c.status === 'PARTIAL_RESPONSES' ? 'badge-amber' :
                  'badge-subtle'
                }`}>
                  {formatEnum(c.status)}
                </span>
                {c.selected_hospital && (
                  <span className="text-[11px] text-[#6e7681] hidden sm:block max-w-[120px] truncate">→ {c.selected_hospital.name}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
