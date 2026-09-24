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
    { label: 'Active Emergencies', value: metrics?.active_emergencies ?? 0, sub: 'Live Hospital Queries', color: metrics?.active_emergencies && metrics.active_emergencies > 0 ? 'text-amber-400' : 'text-[var(--text)]' },
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
      <div className="admin-actions-grid">
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
          <div className="admin-action-title"><h3>Live Emergency Feed</h3><ChevronRight size={16}/></div>
          <p>Real-time state emergency stream with live hospital acceptances and route status.</p>
        </Link>

        <Link href="/admin/users" className="admin-action-card v2-card v2-card-hover">
          <div className="admin-action-icon success">
            <Users size={20} />
          </div>
          <div className="admin-action-title"><h3>User Directory Audit</h3><ChevronRight size={16}/></div>
          <p>Audit platform accounts across USER, HOSPITAL, and ADMIN role permissions.</p>
        </Link>
      </div>
    </div>
  );
}
