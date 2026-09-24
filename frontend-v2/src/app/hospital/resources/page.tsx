// "use client"
"use client";
import { useEffect, useState } from 'react';
import { Hospital as HospitalIcon, Activity, Shield, Heart, Minus, Plus, XCircle, RefreshCw, Check } from 'lucide-react';
import api from '@/lib/api';
import { Hospital } from '@/types';
import { getAuthSession } from '@/lib/auth';

const RETRY_DELAYS = [5000, 15000, 30000];

export default function ResourcesPage() {
  const [info, setInfo] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWaking, setIsWaking] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  // ----- Insurance UI state -----
  const [masterList, setMasterList] = useState<Array<{ group: string; items: Array<{ code: string; name: string }> }>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInsurance, setSelectedInsurance] = useState<Set<string>>(new Set());

  const fetchInfo = async (isManualRetry = false, attempt = 0) => {
    if (isManualRetry) {
      setError(null);
      setIsWaking(false);
      setRetryAttempt(0);
      setLoading(true);
    }

    const session = getAuthSession();
    const hospId = session?.hospital_id;

    if (!hospId && session?.role !== 'ADMIN') {
      setError("Account Error: No hospital ID associated with this session token.");
      setLoading(false);
      return;
    }

    const targetId = hospId ?? 1;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const [hospRes, insuranceRes] = await Promise.all([
        api.get(`/hospitals/${targetId}`, { signal: controller.signal }),
        api.get('/insurance/master-list', { signal: controller.signal }),
      ]);
      clearTimeout(timeoutId);
      setError(null);
      setIsWaking(false);
      setRetryAttempt(0);
      setInfo(hospRes.data);
      setMasterList(insuranceRes.data);
      // pre‑select existing insurance codes
      setSelectedInsurance(new Set(hospRes.data.supported_insurance ?? []));
    } catch (err: any) {
      clearTimeout(timeoutId);
      const status = err.response?.status;
      const detail = err.response?.data?.detail;

      if (status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('emefast_token');
          localStorage.removeItem('emefast_role');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        return;
      } else if (status === 403) {
        setError(`Access forbidden (403): ${detail || "Permission denied."}`);
      } else {
        if (attempt < RETRY_DELAYS.length) {
          setIsWaking(true);
          const nextAttempt = attempt + 1;
          setRetryAttempt(nextAttempt);
          const delay = RETRY_DELAYS[attempt];
          setTimeout(() => {
            fetchInfo(false, nextAttempt);
          }, delay);
          return;
        }
        setIsWaking(false);
        setError("Unable to connect to hospital response network within 8 seconds.");
      }
    } finally {
      clearTimeout(timeoutId);
      if (!isWaking) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchInfo();
  }, []);

  const updateResource = async (patch: Partial<Hospital>) => {
    if (!info) return;
    const next = { ...info, ...patch };
    setInfo(next);
    try {
      const res = await api.patch(`/hospitals/${info.id}/resources`, patch);
      setInfo(res.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to update hospital resources.");
      // reload fresh data to keep UI in sync
      fetchInfo();
    }
  };

  // ----- Insurance UI handlers -----
  const toggleInsurance = (code: string) => {
    setSelectedInsurance((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(code)) newSet.delete(code);
      else newSet.add(code);
      return newSet;
    });
  };

  const selectAllInGroup = (codes: string[]) => {
    setSelectedInsurance((prev) => {
      const newSet = new Set(prev);
      codes.forEach((c) => newSet.add(c));
      return newSet;
    });
  };

  const clearAllInGroup = (codes: string[]) => {
    setSelectedInsurance((prev) => {
      const newSet = new Set(prev);
      codes.forEach((c) => newSet.delete(c));
      return newSet;
    });
  };

  const saveInsurance = async () => {
    await updateResource({ supported_insurance: Array.from(selectedInsurance) });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 pb-[calc(76px+env(safe-area-inset-bottom,0px)+24px)]">
      <div>
        <div className="eyebrow flex items-center gap-1.5 mb-1.5">
          <HospitalIcon size={13} /> Resource Management
        </div>
        <h1 className="page-title">Resources &amp; Readiness</h1>
        <p className="page-subtitle mt-1">{info?.name || 'Hospital'} — Current capacity status</p>
      </div>

      {error ? (
        <div className="v2-card p-6 border border-sos-500/40 bg-sos-950/20 text-center space-y-3" role="alert">
          <div className="w-12 h-12 mx-auto rounded-full bg-sos-500/10 border border-sos-500/25 flex items-center justify-center text-sos-400">
            <XCircle size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Resource Network Offline</h3>
            <p className="text-xs text-neutral-300 mt-1 max-w-md mx-auto">{error}</p>
          </div>
          <button
            onClick={() => fetchInfo(true, 0)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#ff3b30] hover:bg-[#ff453a] text-white text-xs font-bold tracking-wider uppercase transition-all shadow-md active:scale-95 cursor-pointer mx-auto min-h-[44px]"
          >
            <RefreshCw size={14} /> Retry Connection
          </button>
        </div>
      ) : loading || isWaking ? (
        <div className="space-y-6">
          {isWaking && (
            <div className="flex items-center justify-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
              <Activity className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
              <span>Waking up the response network — this can take up to a minute on first load (attempt {retryAttempt}/{RETRY_DELAYS.length})</span>
            </div>
          )}
          {/* Facility Info Card Skeleton */}
          <div className="v2-card p-5 space-y-2 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 bg-neutral-700/30 rounded" />
              <div className="h-5 w-48 bg-neutral-700/40 rounded" />
            </div>
            <div className="h-4 w-64 bg-neutral-700/20 rounded" />
          </div>
          {/* 4-Card Capacity Grid Skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="v2-card p-4 space-y-3 animate-pulse">
                <div className="w-5 h-5 bg-neutral-700/30 rounded" />
                <div className="h-7 w-16 bg-neutral-700/40 rounded" />
                <div className="h-3 w-24 bg-neutral-700/20 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Hospital info */}
          <div className="v2-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className={`badge-${info?.verified ? 'green' : 'red'} text-xs px-2 py-0.5 rounded font-mono font-bold`}> {info?.verified ? '✓ VERIFIED' : 'UNVERIFIED'} </span>
              <h2 className="text-sm font-bold text-white">{info?.name}</h2>
            </div>
            <p className="text-xs text-[#6e7681]">{info?.address}</p>
          </div>

          {/* Resource controls */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="v2-card p-4 space-y-3">
              <Heart size={18} className="text-ok-400" />
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xl font-mono">{info?.available_icu ?? '—'}</strong>
                <div className="stepper">
                  <button aria-label="Decrease ICU beds" onClick={() => updateResource({ available_icu: Math.max(0, (info?.available_icu ?? 0) - 1) })}>
                    <Minus size={14} />
                  </button>
                  <button aria-label="Increase ICU beds" onClick={() => updateResource({ available_icu: (info?.available_icu ?? 0) + 1 })}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="text-[11px] uppercase tracking-wide opacity-60">Available ICU Beds</div>
            </div>

            <div className="v2-card p-4 space-y-3">
              <Shield size={18} className="text-warn-300" />
              <div className="text-xl font-mono">{info?.trauma_level ?? 'Tier 1'}</div>
              <div className="text-[11px] uppercase tracking-wide opacity-60">Trauma Level</div>
            </div>

            <div className="v2-card p-4 space-y-3">
              <Activity size={18} className={info?.verified ? 'text-ok-400' : 'text-sos-300'} />
              <button
                className={`status-switch ${info?.emergency_status === 'ONLINE' ? 'on' : ''}`}
                onClick={() => updateResource({ emergency_status: info?.emergency_status === 'ONLINE' ? 'OFFLINE' : 'ONLINE', verified: info?.emergency_status === 'ONLINE' ? false : true })}
                aria-pressed={info?.emergency_status === 'ONLINE'}
              >
                <span />{info?.emergency_status === 'ONLINE' ? 'Operational' : 'Offline'}
              </button>
              <div className="text-[11px] uppercase tracking-wide opacity-60">ER Status</div>
            </div>

            <div className="v2-card p-4 space-y-3">
              <HospitalIcon size={18} className="text-info-300" />
              <div className="text-xl font-mono">{info?.available_beds ?? '—'}</div>
              <div className="text-[11px] uppercase tracking-wide opacity-60">Available Beds</div>
            </div>
          </div>

          {/* Capabilities */}
          {info?.capabilities && (
            <div className="v2-card p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Available Specialties</h3>
              <div className="flex flex-wrap gap-2">
                {info.capabilities.split(',').map((cap, i) => (
                  <span key={i} className="badge-blue text-xs px-2.5 py-1 rounded font-mono">{cap.trim()}</span>
                ))}
              </div>
            </div>
          )}

          {/* ----- Supported Insurance Section ----- */}
          <div className="v2-card p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Supported Insurance</h3>
            <p className="text-sm text-neutral-300">Self-declared by hospital. Confirm coverage at admission.</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search insurance…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 rounded border border-neutral-600 bg-neutral-800/30 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {masterList.filter(g => g.items.some(it => it.name.toLowerCase().includes(searchTerm.toLowerCase()) || it.code.toLowerCase().includes(searchTerm.toLowerCase()))).map(group => (
                <div key={group.group} className="border-b border-neutral-700 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-white">{group.group}</h4>
                    <button
                      type="button"
                      className="text-xs text-primary-400 underline"
                      onClick={() => {
                        const codes = group.items.map(it => it.code);
                        const allSelected = codes.every(c => selectedInsurance.has(c));
                        allSelected ? clearAllInGroup(codes) : selectAllInGroup(codes);
                      }}
                    >
                      {group.items.map(it => it.code).every(c => selectedInsurance.has(c)) ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.items
                      .filter(it => it.name.toLowerCase().includes(searchTerm.toLowerCase()) || it.code.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map(it => (
                        <label key={it.code} className="inline-flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={selectedInsurance.has(it.code)}
                            onChange={() => toggleInsurance(it.code)}
                            className="form-checkbox h-4 w-4 rounded text-primary-600 bg-neutral-700 border-neutral-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-white">{it.name} ({it.code})</span>
                        </label>
                      ))}
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">{group.items.filter(it => selectedInsurance.has(it.code)).length} selected</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-neutral-400">Total selected: {selectedInsurance.size}</span>
              <button
                onClick={saveInsurance}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded disabled:opacity-50"
                disabled={loading}
              >
                Save Insurance
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
