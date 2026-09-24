import TopNav from '@/components/TopNav';
import AuthGuard from '@/components/AuthGuard';
import { HospitalProvider } from '@/context/HospitalContext';

export default function HospitalLayout({ children }: { children: React.ReactNode }) {
  return (
    <HospitalProvider>
      <div className="hospital-app min-h-screen flex flex-col">
        <TopNav role="HOSPITAL" />
        <main className="flex-1">
          <AuthGuard requiredRole="HOSPITAL">
            {children}
          </AuthGuard>
        </main>
        <footer className="hospital-footer px-6 py-3 flex items-center justify-between pb-[calc(76px+env(safe-area-inset-bottom,0px)+16px)]">
          <span>▸ Hospital ER Coordination Engine — Real-time case intake.</span>
          <span>Toll-Free SOS: <span className="text-sos-300">108 / 112</span> · © 2026 EMEFast.</span>
        </footer>
      </div>
    </HospitalProvider>
  );
}
