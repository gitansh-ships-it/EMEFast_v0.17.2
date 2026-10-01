"use client";
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock, Eye, Clock, FileText, CheckCircle2 } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-[#f5f5f7] pb-16">
      {/* Prominent Decision-Support Boundary Notice */}
      <aside aria-label="Emergency Services Notice" className="w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-center text-xs font-medium">
        <span>Decision-support only. EMEFast does not dispatch ambulances. 108 / 112 remain the official emergency numbers.</span>
      </aside>

      {/* Top Navigation */}
      <header className="topnav px-5 sm:px-8 py-4 border-b border-white/10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-white transition-colors">
            <ArrowLeft size={16} /> Back to EMEFast
          </Link>
          <div className="text-xs font-bold tracking-widest text-[#ff3b30] uppercase">
            Pilot Governance
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-5 sm:px-8 pt-12 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#30d158]/10 border border-[#30d158]/20 text-[#30d158] text-xs font-semibold mb-4">
          <ShieldCheck size={14} /> Emergency Coordination Pilot Disclosure
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
          Privacy & Pilot Data Disclosure
        </h1>
        <p className="mt-3 text-neutral-400 text-sm sm:text-base leading-relaxed">
          EMEFast coordinates emergency hospital selection and pre-arrival intake. Learn how emergency details, GPS location, and voice notes are handled during this pilot.
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
              <h2 className="text-lg font-bold text-white">1. Emergency Intake Data Collection</h2>
              <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                Emergency activation collects details needed for hospital intake coordination. Patient details (name if provided, age, symptoms, vital signs, and incident location) are transmitted to participating hospital emergency departments within clinical proximity to facilitate pre-arrival readiness.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#64d2ff] shrink-0">
              <Eye size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">2. Clinical Need-to-Know Information</h2>
              <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                Hospitals receive clinical triage requirements (e.g. ICU bed requirement, specialized surgery, trauma support) to evaluate whether they can receive the patient. Intake details are accessible only to registered emergency desk operators.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#30d158] shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">3. Data Handling in Pilot</h2>
              <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                During this pilot, the system stores entered patient names (defaults to Unknown Patient if omitted), clinical condition notes and selected symptoms, device or pinned GPS coordinates, and voice audio recordings with raw text dictations. These records are stored in operational databases to coordinate transfers and generate operational audit trails. No end-to-end encryption is claimed at this stage. Medical and statutory data retention practices remain subject to ongoing pilot evaluation and legal review.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#ff9f0a] shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">4. Standards & Statutory Consideration</h2>
              <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                Designed with consideration for ABDM, FHIR and applicable Indian data-protection requirements. Compliance status: pilot / validation required. Statutory alignment under the Digital Personal Data Protection (DPDP) Act and emergency medical data handling requires formal legal review before production deployment.
              </p>
            </div>
          </div>

          {/* Definition of Admin-Verified */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
            <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-[#30d158]" /> Definition of &quot;Admin-Verified&quot; Facility Status
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed m-0">
              A system administrator has marked the facility as verified in the hospital registry. Criteria are set by the pilot administrator. Not clinical accreditation or statutory certification.
            </p>
          </div>
        </div>

        {/* Action / Return */}
        <div className="pt-4 flex justify-between items-center text-xs text-neutral-500">
          <span>EMEFast · Emergency Medical Coordination System</span>
          <Link href="/" className="text-neutral-300 hover:text-white underline underline-offset-4">
            Return to Homepage
          </Link>
        </div>
      </section>
    </main>
  );
}
