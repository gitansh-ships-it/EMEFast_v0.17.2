"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole: 'HOSPITAL' | 'ADMIN' | 'USER';
}

export default function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const session = getAuthSession();

    // Check if session satisfies role requirement:
    // ADMIN can access HOSPITAL routes for surveillance, but HOSPITAL cannot access ADMIN routes.
    const isAllowed = Boolean(
      session &&
      (session.role === requiredRole ||
        (requiredRole === 'HOSPITAL' && session.role === 'ADMIN') ||
        requiredRole === 'USER')
    );

    if (!isAllowed) {
      setAuthorized(false);
      const returnUrl = encodeURIComponent(pathname || `/${requiredRole.toLowerCase()}/dashboard`);
      router.replace(`/login?role=${requiredRole}&redirect=${returnUrl}`);
    } else {
      setAuthorized(true);
    }
  }, [router, pathname, requiredRole]);

  if (authorized === null) {
    return (
      <div className="min-h-[55vh] flex flex-col items-center justify-center p-8 text-center" role="status">
        <div className="w-12 h-12 rounded-2xl bg-sos-500/10 border border-sos-500/20 flex items-center justify-center text-sos-400 mb-3 shadow-[0_4px_16px_rgba(255,59,48,0.15)]">
          <RefreshCw className="animate-spin" size={20} />
        </div>
        <div className="text-sm font-semibold text-[var(--text)] font-mono">Verifying Security Credentials</div>
        <p className="text-xs text-[var(--muted)] mt-1">Validating signed institutional token...</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-[55vh] flex flex-col items-center justify-center p-8 text-center" role="alert">
        <div className="w-12 h-12 rounded-2xl bg-sos-500/10 border border-sos-500/20 flex items-center justify-center text-sos-400 mb-3">
          <ShieldAlert size={22} />
        </div>
        <h3 className="text-base font-bold text-[var(--text)]">Institutional Authentication Required</h3>
        <p className="text-xs text-[var(--muted)] mt-1">Redirecting to verified agency login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
