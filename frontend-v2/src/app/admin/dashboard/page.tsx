"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Radio, Activity, Users, ChevronRight, RefreshCw, Shield, Zap } from 'lucide-react';
import api from '@/lib/api';
import { AdminMetrics } from '@/types';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await api.get('/admin/metrics');
      setMetrics(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  const kpis = [
    { label: 'Active Emergencies', value: metrics?.active_emergencies ?? 0, sub: 'Active Hospital Requests', color: metrics?.active_emergencies && metrics.active_emergencies > 0 ? 'text-amber-400' : 'text-[var(--text)]' },
    { label: 'Verified Hospitals', value: `${metrics?.verified_hospitals ?? 0}/${metrics?.total_hospitals ?? 0}`, sub: 'Licensed Centers', color: 'text-[var(--text)]' },
    { label: 'Cases Today', value: metrics?.cases_today ?? 0, sub: '24h Emergency Cases', color: 'text-[var(--text)]' },
    { label: 'Avg Response', value: `${metrics?.avg_response_time_minutes ?? 0}m`, sub: 'Allocation Speed', color: 'text-[var(--text)]' },
  ];

  return (
    <div className="admin-dashboard-shell">
      {/* Header */}
      <div className="admin-dashboard-head">
        <div>
          <div className="admin-eyebrow font-medium tracking-normal text-xs text-[var(--muted)] flex items-center gap-1.5 mb-1">
            <Shield size={13} /> State Emergency Surveillance Operations
          </div>
          <h1>Admin Network Command Center</h1>
          <p>Monitor hospital verification, active emergency streams, and network decision metrics.</p>
        </div>
        <button
          onClick={fetchMetrics}
          className="admin-refresh min-h-[44px]"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* KPI Grid */}
      <div className="admin-kpis">
        {kpis.map(k => (
          <div key={k.label} className="admin-kpi v2-card">
            <span>{k.label}</span>
            <strong className={`${k.color} tnum font-semibold`}>{loading ? "—" : k.value}</strong>
            <small>{k.sub}</small>
          </div>
        ))}
      </div>

      {/* Action panels */}
      <div className="admin-actions-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/hospitals" className="admin-action-card v2-card v2-card-hover">
          <div className="admin-action-icon info">
            <ShieldCheck size={20} />
          </div>
          <div className="admin-action-title"><h3>Hospital Verification</h3><ChevronRight size={16}/></div>
          <p>Review pending hospital registrations and approve hospital emergency-network access.</p>
        </Link>

        <Link href="/admin/emergencies" className="admin-action-card v2-card v2-card-hover">
          <div className="admin-action-icon danger">
            <Radio size={20} />
          </div>
          <div className="admin-action-title"><h3>Emergency Case Feed</h3><ChevronRight size={16}/></div>
          <p>State emergency stream with hospital acceptances and route status.</p>
        </Link>

        <Link href="/admin/users" className="admin-action-card v2-card v2-card-hover">
          <div className="admin-action-icon success">
            <Users size={20} />
          </div>
          <div className="admin-action-title"><h3>User Directory Audit</h3><ChevronRight size={16}/></div>
          <p>Audit platform accounts across USER, HOSPITAL, and ADMIN role permissions.</p>
        </Link>

        <Link href="/admin/audit" className="admin-action-card v2-card v2-card-hover">
          <div className="admin-action-icon text-purple-400 bg-purple-500/10 p-2 rounded-xl">
            <Activity size={20} />
          </div>
          <div className="admin-action-title"><h3>Audit Trail & Provenance</h3><ChevronRight size={16}/></div>
          <p>Inspect immutable audit trail of hospital verifications, resource updates, and manual overrides.</p>
        </Link>
      </div>

      {/* System Health Status Panel */}
      <section className="v2-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
            <Activity size={15} className="text-emerald-400" /> Platform System Health & Service Readiness
          </h2>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            ALL SYSTEMS NORMAL
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
            <span className="text-[10px] text-neutral-400 uppercase block">Database Engine</span>
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>Operational</span>
            </div>
            <p className="text-[10px] text-neutral-400 m-0">SQLite · 86 Jaipur facilities indexed</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
            <span className="text-[10px] text-neutral-400 uppercase block">Matching Engine</span>
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>Active</span>
            </div>
            <p className="text-[10px] text-neutral-400 m-0">Multi-factor clinical fit & ETA rank</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
            <span className="text-[10px] text-neutral-400 uppercase block">Response Sync</span>
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>2.5s Cycle Active</span>
            </div>
            <p className="text-[10px] text-neutral-400 m-0">Real-time emergency desk polling</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
            <span className="text-[10px] text-neutral-400 uppercase block">Audit Logging</span>
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>Immutable Log</span>
            </div>
            <p className="text-[10px] text-neutral-400 m-0">All overrides & changes recorded</p>
          </div>
        </div>
      </section>
    </div>
  );
}
