import UserDashboard from '@/app/user/dashboard/page';
import AuthGuard from '@/components/AuthGuard';

export default function AmbulanceDashboardPage() {
  return (
    <AuthGuard requiredRole="USER">
      <UserDashboard />
    </AuthGuard>
  );
}
