"use client";
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock, Eye, Clock, FileText, CheckCircle2 } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-[#f5f5f7] pb-16">
      {/* Top Navigation */}
      <header className="topnav px-5 sm:px-8 py-4 border-b border-white/10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-white transition-colors">
            <ArrowLeft size={16} /> Back to EMEFast
          </Link>
          <div className="text-xs font-bold tracking-widest text-[#ff3b30] uppercase">
            Health Data Trust
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-5 sm:px-8 pt-12 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#30d158]/10 border border-[#30d158]/20 text-[#30d158] text-xs font-semibold mb-4">
          <ShieldCheck size={14} /> Consent-First Emergency Architecture
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
          Privacy & Consent Disclosure
        </h1>
        <p className="mt-3 text-neutral-400 text-sm sm:text-base leading-relaxed">
          EMEFast coordinates clinical capacity under strict data minimization. Learn how your emergency health data, GPS location, and voice telemetry are protected during active triage.
        </p>
      </section>

      {/* Privacy Pillars Grid */}
      <section className="max-w-4xl mx-auto px-5 sm:px-8 space-y-6">
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 bg-white/[0.02] space-y-6">
          <div className="flex gap-4 items-start">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#ff3b30] shrink-0">
              <Lock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">1. Explicit Emergency Consent Model</h2>
              <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                Emergency activation via EMEFast triggers a scoped consent token. Patient details (age, symptoms, vitals, and ABHA ID if provided) are transmitted strictly to verified hospital emergency departments within clinical proximity that have active capability matches.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#64d2ff] shrink-0">
              <Eye size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">2. Strict Need-to-Know Clinical Disclosure</h2>
              <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                Hospitals receive clinical triage requirements (e.g. ICU bed requirement, ventilator need, trauma surgical capacity) to determine acceptance. Full medical history is never broadcast publicly or exposed to unverified institutions.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#30d158] shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">3. Ephemeral Retention & Access Holds</h2>
              <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                Emergency coordination sessions, GPS telemetry, and pre-arrival voice memos are retained only for the duration of the active transfer plus mandatory medical audit records. Resource reservations automatically expire after 15 minutes unless verified upon patient arrival.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#ff9f0a] shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">4. Standards & Statutory Alignment</h2>
              <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                Architecture designed in alignment with ABDM (Ayushman Bharat Digital Mission) principles, DISHA guidelines, and FHIR data standards for emergency healthcare interoperability.
              </p>
            </div>
          </div>
        </div>

        {/* Action / Return */}
        <div className="pt-4 flex justify-between items-center text-xs text-neutral-500">
          <span>EMEFast · Emergency Medical Fast Response System</span>
          <Link href="/" className="text-neutral-300 hover:text-white underline underline-offset-4">
            Return to Homepage
          </Link>
        </div>
      </section>
    </main>
  );
}
