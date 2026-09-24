"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock, MapPin, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { EmergencyCase } from '@/types';
import { formatEnum } from '@/lib/format';

export default function HospitalEmergencyDetail(){
 const {id}=useParams<{id:string}>(); const [c,setC]=useState<EmergencyCase|null>(null); const [loading,setLoading]=useState(true);
 useEffect(()=>{api.get(`/emergency/${id}`).then(r=>setC(r.data)).finally(()=>setLoading(false));},[id]);
 if(loading) return <div className="max-w-4xl mx-auto px-6 py-10"><div className="v2-card p-8 text-center">Loading emergency…</div></div>;
 if(!c) return <div className="max-w-4xl mx-auto px-6 py-10"><div className="v2-card p-8">Emergency not found.</div></div>;
 return <div className="max-w-4xl mx-auto px-6 py-8 space-y-5"><Link href="/hospital/dashboard" className="back-link"><ArrowLeft size={15}/> Back to inbox</Link><section className="v2-card p-6 space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="eyebrow">NEW EMERGENCY · {c.case_code}</div><h1 className="text-2xl font-bold mt-2">{c.condition}</h1><p className="text-sm opacity-70 mt-1">{c.patient_name}{c.patient_age?` · ${c.patient_age} years`:''}</p></div><span className="badge-amber text-[11px] px-2.5 py-1 rounded-full font-mono font-bold">{formatEnum(c.priority)}</span></div><div className="detail-grid"><div><span>Transport</span><strong>{formatEnum(c.transport_mode)}</strong></div><div><span>Requirement</span><strong>{c.requirements}</strong></div><div><span>Location</span><strong><MapPin size={13}/> {c.address || `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`}</strong></div><div><span>Created</span><strong><Clock size={13}/> {new Date(c.created_at).toLocaleTimeString()}</strong></div></div><div className="response-list"><h2 className="text-sm font-bold">Hospital responses</h2>{c.responses?.map(r=><div key={r.hospital_id} className="response-row"><span>{r.hospital_name}</span><span className={r.response==='ACCEPTED'?'text-ok-400':r.response==='REJECTED'?'text-sos-300':'text-warn-300'}>{r.response}</span></div>)}</div></section></div>;
}
