"use client";

import { useEffect, useState } from 'react';
import { Shield, Search, Check, RefreshCw, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';

type InsuranceItem = {
  code: string;
  name: string;
};

type InsuranceGroup = {
  group: string;
  items: InsuranceItem[];
};

interface HospitalInsuranceManagerProps {
  hospitalId: number;
  initialInsurances?: string[];
  onSaved?: (insurances: string[]) => void;
}

const FALLBACK_MASTER_LIST: InsuranceGroup[] = [
  {
    group: "GOVERNMENT / PUBLIC SCHEMES",
    items: [
      { code: "RGHS", name: "Rajasthan Government Health Scheme (RGHS)" },
      { code: "PMJAY", name: "Ayushman Bharat PM-JAY" },
      { code: "CGHS", name: "Central Government Health Scheme (CGHS)" },
      { code: "ECHS", name: "Ex-Servicemen Contributory Health Scheme" },
      { code: "ESIC", name: "Employees' State Insurance (ESIC)" },
      { code: "CAPF", name: "Central Armed Police Forces Health Scheme" },
      { code: "RELHS", name: "Railway Employees Liberalized Health Scheme" },
      { code: "MAA_YOJANA", name: "Mukhyamantri Amrutum (MAA) Yojana" },
    ],
  },
  {
    group: "PUBLIC SECTOR GENERAL INSURERS",
    items: [
      { code: "NEW_INDIA", name: "The New India Assurance Co. Ltd." },
      { code: "UNITED_INDIA", name: "United India Insurance Company" },
      { code: "NATIONAL", name: "National Insurance Company" },
      { code: "ORIENTAL", name: "The Oriental Insurance Company" },
    ],
  },
  {
    group: "PRIVATE HEALTH INSURERS",
    items: [
      { code: "STAR_HEALTH", name: "Star Health & Allied Insurance" },
      { code: "HDFC_ERGO", name: "HDFC ERGO General Insurance" },
      { code: "ICICI_LOMBARD", name: "ICICI Lombard General Insurance" },
      { code: "CARE_HEALTH", name: "Care Health Insurance (Religare)" },
      { code: "NIVA_BUPA", name: "Niva Bupa Health Insurance (Max Bupa)" },
      { code: "BAJAJ_ALLIANZ", name: "Bajaj Allianz General Insurance" },
      { code: "TATA_AIG", name: "Tata AIG General Insurance" },
      { code: "ADITYA_BIRLA", name: "Aditya Birla Health Insurance" },
      { code: "MANIPAL_CIGNA", name: "ManipalCigna Health Insurance" },
      { code: "SBI_GENERAL", name: "SBI General Insurance" },
    ],
  },
  {
    group: "THIRD PARTY ADMINISTRATORS (TPAS)",
    items: [
      { code: "MEDI_ASSIST", name: "Medi Assist Insurance TPA" },
      { code: "PARAMOUNT", name: "Paramount Health Services TPA" },
      { code: "MDINDIA", name: "MDIndia Health Insurance TPA" },
      { code: "HERITAGE", name: "Heritage Health TPA" },
      { code: "FAMILY_HEALTH", name: "Family Health Plan Insurance TPA" },
      { code: "VIDAL", name: "Vidal Health Insurance TPA" },
    ],
  },
  {
    group: "DIRECT / CORPORATE / CASH",
    items: [
      { code: "CORPORATE_TIEUP", name: "Direct Corporate Cashless Tie-up" },
      { code: "CASH_ONLY", name: "Self-Pay / Cash / UPI Only" },
    ],
  },
];

export default function HospitalInsuranceManager({
  hospitalId,
  initialInsurances = [],
  onSaved,
}: HospitalInsuranceManagerProps) {
  const [masterList, setMasterList] = useState<InsuranceGroup[]>(FALLBACK_MASTER_LIST);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialInsurances));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      let master = FALLBACK_MASTER_LIST;
      let currentCodes: string[] = initialInsurances || [];

      try {
        const masterRes = await api.get('/insurance/master-list');
        if (masterRes.data && masterRes.data.length > 0) {
          master = masterRes.data;
        }
      } catch {
        // Fallback gracefully to embedded master list
      }

      try {
        const hospRes = await api.get(`/hospitals/${hospitalId}/insurances`);
        if (hospRes.data?.supported_insurance) {
          currentCodes = hospRes.data.supported_insurance;
        }
      } catch {
        // Fallback to initial
      }

      if (!cancelled) {
        setMasterList(master);
        setSelected(new Set(currentCodes));
        setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);

  const toggleCode = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
    setSaveSuccess(false);
  };

  const selectAllInGroup = (items: InsuranceItem[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((it) => next.add(it.code));
      return next;
    });
    setSaveSuccess(false);
  };

  const clearAllInGroup = (items: InsuranceItem[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((it) => next.delete(it.code));
      return next;
    });
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    const codesList = Array.from(selected);

    try {
      await api.put(`/hospitals/${hospitalId}/insurances`, {
        supported_insurance: codesList,
      });
      setSaveSuccess(true);
      onSaved?.(codesList);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      // Fallback to resources patch if needed
      try {
        await api.patch(`/hospitals/${hospitalId}/resources`, {
          supported_insurance: codesList,
        });
        setSaveSuccess(true);
        onSaved?.(codesList);
        setTimeout(() => setSaveSuccess(false), 4000);
      } catch (fallbackErr: any) {
        setError(fallbackErr.response?.data?.detail || err.response?.data?.detail || 'Failed to save insurances');
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredGroups = masterList.map((grp) => {
    const q = search.trim().toLowerCase();
    if (!q) return grp;
    return {
      ...grp,
      items: grp.items.filter(
        (it) => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q)
      ),
    };
  }).filter((grp) => grp.items.length > 0);

  if (loading) {
    return (
      <div className="v2-card p-6 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-neutral-700/40 rounded" />
        <div className="h-10 w-full bg-neutral-700/20 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-14 bg-neutral-700/20 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="v2-card p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="text-ok-400" size={18} />
            <h3 className="text-base font-bold text-white">Supported Insurance Coverage</h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Select government schemes (RGHS, PM-JAY, CGHS, ECHS) and private insurers accepted by this facility.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-neutral-400">
            Selected: <strong className="text-ok-400">{selected.size}</strong> schemes
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
              saveSuccess
                ? 'bg-ok-600 text-white'
                : 'bg-primary-600 hover:bg-primary-500 text-white active:scale-95'
            } disabled:opacity-50`}
          >
            {saving ? (
              <>
                <RefreshCw size={13} className="animate-spin" /> Saving…
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle2 size={13} /> Saved!
              </>
            ) : (
              <>
                <Check size={13} /> Save Coverage
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-sos-950/40 border border-sos-500/40 text-sos-300 text-xs">
          {error}
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
        <input
          type="text"
          placeholder="Filter by name or code (e.g. RGHS, PMJAY, Star Health, TATA)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-neutral-900/60 border border-neutral-700/60 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-ok-400 transition-colors"
        />
      </div>

      {/* Categorized Schemes */}
      <div className="space-y-6 max-h-[460px] overflow-y-auto pr-1">
        {filteredGroups.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 text-xs">
            No insurance schemes match &quot;{search}&quot;.
          </div>
        ) : (
          filteredGroups.map((grp) => {
            const allSelected = grp.items.every((it) => selected.has(it.code));
            const selectedCount = grp.items.filter((it) => selected.has(it.code)).length;

            return (
              <div key={grp.group} className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-neutral-300 uppercase tracking-wider text-[11px]">
                    {grp.group} <span className="text-neutral-500 font-normal">({selectedCount}/{grp.items.length})</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => (allSelected ? clearAllInGroup(grp.items) : selectAllInGroup(grp.items))}
                      className="text-[11px] text-primary-400 hover:text-primary-300 font-medium underline cursor-pointer"
                    >
                      {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {grp.items.map((it) => {
                    const isChecked = selected.has(it.code);
                    return (
                      <button
                        key={it.code}
                        type="button"
                        onClick={() => toggleCode(it.code)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-ok-950/20 border-ok-500/50 text-white'
                            : 'bg-neutral-900/30 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-300'
                        }`}
                      >
                        <div
                          className={`mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center border transition-colors ${
                            isChecked
                              ? 'bg-ok-500 border-ok-500 text-black'
                              : 'border-neutral-600 bg-neutral-800'
                          }`}
                        >
                          {isChecked && <Check size={11} strokeWidth={3} />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold leading-tight line-clamp-2">
                            {it.name}
                          </div>
                          <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                            {it.code}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-neutral-800 text-xs">
        <span className="text-neutral-400">
          Total Selected: <strong className="text-white font-mono">{selected.size}</strong> schemes
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
            saveSuccess
              ? 'bg-ok-600 text-white'
              : 'bg-primary-600 hover:bg-primary-500 text-white active:scale-95'
          } disabled:opacity-50`}
        >
          {saving ? 'Saving…' : saveSuccess ? '✓ Saved!' : 'Save Coverage'}
        </button>
      </div>
    </div>
  );
}
