"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Radio, Lock, Mail, ArrowRight, ShieldCheck, Hospital as HospitalIcon, Shield, RefreshCw, Ambulance } from 'lucide-react';
import api from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams?.get('role')?.toUpperCase() || '';
  const redirectParam = searchParams?.get('redirect') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Prefill default based on requested role if fields are untouched
  useEffect(() => {

  }, [roleParam]);

  const handleLogin = async (loginEmail?: string, loginPass?: string) => {
    setError('');
    setLoading(true);
    const useEmail = (loginEmail || email).trim();
    const usePass = loginPass || password;

    try {
      // Live database aliases: check both current and legacy domain formats
      const candidateEmails = [useEmail];
      if (useEmail === 'hospital-sms@emefast.example') {
        candidateEmails.push('hospital@sms.gov.in');
      } else if (useEmail === 'hospital@sms.gov.in') {
        candidateEmails.push('hospital-sms@emefast.example');
      } else if (useEmail === 'admin@emefast.example') {
        candidateEmails.push('admin@emefast.gov.in');
      } else if (useEmail === 'admin@emefast.gov.in') {
        candidateEmails.push('admin@emefast.example');
      }

      let res: any = null;
      let lastErr: any = null;

      for (const cand of candidateEmails) {
        try {
          const formData = new FormData();
          formData.append('username', cand);
          formData.append('password', usePass);
          res = await api.post('/auth/login', formData);
          if (res?.data?.access_token) break;
        } catch (e: any) {
          lastErr = e;
        }
      }

      if (!res?.data?.access_token) {
        throw lastErr || new Error('Invalid email or password.');
      }

      const { access_token, role, user_name, hospital_id } = res.data;

      localStorage.setItem('emefast_token', access_token);
      localStorage.setItem('emefast_role', role);
      localStorage.setItem('emefast_user_name', user_name);
      if (hospital_id) {
        localStorage.setItem('emefast_hospital_id', hospital_id.toString());
      } else {
        localStorage.removeItem('emefast_hospital_id');
      }

      // If a specific redirect was requested and is safe, route there
      if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')) {
        router.push(redirectParam);
      } else if (role === 'HOSPITAL') {
        router.push('/hospital/dashboard');
      } else if (role === 'ADMIN') {
        router.push('/admin/dashboard');
      } else {
        router.push('/user/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:py-12 pt-[env(safe-area-inset-top,0px)] pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
      <div className="w-full max-w-md space-y-5">
        {/* Brand */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2.5 min-h-[44px]">
            <Image
              src="/app-logo.png"
              alt="EMEFast"
              width={40}
              height={40}
              priority
              className="rounded-[12px] shadow-[0_6px_20px_rgba(255,59,48,.3)]"
            />
            <span className="text-xl font-bold tracking-tight text-[var(--text)]">EMEFast</span>
          </Link>
          <h2 className="text-xl font-bold text-[var(--text)] tracking-tight">Access Emergency Network</h2>
          <p className="text-xs text-[var(--muted)]">Authorized state coordination & verified institutions</p>
        </div>

        {/* Role Access Requirement Notice */}
        {roleParam === 'HOSPITAL' && (
          <div className="p-3.5 rounded-xl border border-sos-500/30 bg-sos-500/10 flex items-start gap-3 text-xs text-[var(--text)]" role="alert">
            <HospitalIcon className="text-sos-400 shrink-0 mt-0.5" size={16} />
            <div>
              <strong className="text-sos-300 font-semibold block">Hospital ER Desk Verification Required</strong>
              <span>You must sign in with a verified hospital ER desk account to access incoming emergency intake streams.</span>
            </div>
          </div>
        )}

        {roleParam === 'ADMIN' && (
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3 text-xs text-[var(--text)]" role="alert">
            <Shield className="text-amber-400 shrink-0 mt-0.5" size={16} />
            <div>
              <strong className="text-amber-300 font-semibold block">State Command Verification Required</strong>
              <span>Administrative credentials are required to monitor cross-facility surveillance and network telemetry.</span>
            </div>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
          className="v2-card p-6 space-y-4"
        >
          {error && (
            <div className="p-3.5 rounded-xl border border-sos-400/30 bg-sos-400/10 text-sos-300 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--muted)]">Email Address</label>
            <div className="relative w-full">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtle)]" size={16} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full block pl-10 pr-4 min-h-[44px] rounded-xl bg-white/[0.05] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-sos-400 focus:ring-1 focus:ring-sos-400 text-base sm:text-sm transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--muted)]">Password</label>
            <div className="relative w-full">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtle)]" size={16} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full block pl-10 pr-4 min-h-[44px] rounded-xl bg-white/[0.05] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-sos-400 focus:ring-1 focus:ring-sos-400 text-base sm:text-sm transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] rounded-full bg-[#ff3b30] hover:bg-[#ff453a] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-[0_8px_25px_rgba(255,59,48,0.3)] disabled:opacity-50 active:scale-95 cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Demo Fast Login Pills */}
        <div className="v2-card p-4 space-y-2">
          <div className="text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider">
            DEMO ENVIRONMENT
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setEmail('hospital@sms.gov.in');
                setPassword('hospital123');
                handleLogin('hospital@sms.gov.in', 'hospital123');
              }}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-left flex items-center justify-between transition-colors text-xs text-[var(--text)] disabled:opacity-50"
            >
              <div>
                <strong className="block font-semibold">SMS Hospital</strong>
                <span className="text-[10px] text-[var(--muted)] font-mono">hospital@sms.gov.in</span>
              </div>
              <ShieldCheck size={14} className="text-ok-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => {
                setEmail('admin@emefast.gov.in');
                setPassword('admin123');
                handleLogin('admin@emefast.gov.in', 'admin123');
              }}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-left flex items-center justify-between transition-colors text-xs text-[var(--text)] disabled:opacity-50"
            >
              <div>
                <strong className="block font-semibold">State Admin</strong>
                <span className="text-[10px] text-[var(--muted)] font-mono">admin@emefast.gov.in</span>
              </div>
              <ShieldCheck size={14} className="text-amber-400 shrink-0" />
            </button>
          </div>
        </div>

        {/* Ambulance Direct Access (No login needed) */}
        <div className="pt-1">
          <Link
            href="/ambulance/dashboard"
            className="w-full py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center justify-between transition-colors min-h-[44px]"
          >
            <div className="flex items-center gap-2">
              <Ambulance size={16} className="text-emerald-400 shrink-0" />
              <span>Open Ambulance Workspace (No sign-in required)</span>
            </div>
            <ArrowRight size={14} className="text-emerald-400/70" />
          </Link>
        </div>

        <p className="text-center text-xs">
          <Link href="/" className="text-neutral-400 hover:text-white transition-colors min-h-[44px] inline-flex items-center justify-center px-4 font-medium">
            ← Back to Home
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-sos-400" size={24} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
