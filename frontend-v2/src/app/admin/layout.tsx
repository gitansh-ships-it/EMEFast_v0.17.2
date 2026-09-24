import TopNav from '@/components/TopNav';
import AuthGuard from '@/components/AuthGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-app min-h-screen flex flex-col">
      <TopNav role="ADMIN" />
      <main className="flex-1">
        <AuthGuard requiredRole="ADMIN">
          {children}
        </AuthGuard>
      </main>
      <footer className="admin-footer px-6 py-3 flex items-center justify-between">
        <span>▸ Admin Network Command — State-level emergency surveillance operations.</span>
        <span>Toll-Free SOS: <span className="text-sos-300">108 / 112</span> · © 2026 EMEFast.</span>
      </footer>
    </div>
  );
}
