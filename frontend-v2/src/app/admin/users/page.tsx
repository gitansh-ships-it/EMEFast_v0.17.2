"use client";
import { useEffect, useState } from 'react';
import { Users, Shield, Hospital as HospitalIcon } from 'lucide-react';
import api from '@/lib/api';
import { User } from '@/types';
import { formatEnum } from '@/lib/format';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/users')
      .then(r => setUsers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const roleIcon = (role: string) => {
    if (role === 'ADMIN') return <Shield size={14} className="text-info-300" />;
    if (role === 'HOSPITAL') return <HospitalIcon size={14} className="text-ok-400" />;
    return <Users size={14} className="text-sos-300" />;
  };

  const roleBadge = (role: string) => {
    if (role === 'ADMIN') return 'badge-blue';
    if (role === 'HOSPITAL') return 'badge-green';
    return 'badge-subtle';
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <div className="eyebrow flex items-center gap-1.5 mb-1.5">
          <Users size={13} /> User Directory Audit
        </div>
        <h1 className="page-title">User Management</h1>
        <p className="page-subtitle mt-1">Audit platform accounts across all role permissions</p>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-3 gap-4">
        {(['USER', 'HOSPITAL', 'ADMIN'] as const).map(role => (
          <div key={role} className="v2-card p-4 space-y-1">
            <div className="flex items-center gap-2">{roleIcon(role)}<span className="text-[11px] font-mono text-[#484f58] uppercase">{role}</span></div>
            <div className="text-xl font-bold text-white font-mono">
              {users.filter(u => u.role === role).length}
            </div>
            <div className="text-[10px] text-[#484f58]">Active accounts</div>
          </div>
        ))}
      </div>

      <div className="v2-card p-5 space-y-2">
        {loading ? (
          <div className="py-8 text-center text-xs text-[#6e7681] font-mono">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#6e7681]">No users found.</div>
        ) : (
          users.map(u => (
            <div key={u.id} className="v2-card v2-card-hover p-3.5 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#30363d] flex items-center justify-center text-[#8b949e] font-mono font-bold text-xs shrink-0">
                  {u.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <div className="text-xs font-bold text-white">{u.name}</div>
                  <div className="text-[11px] text-[#6e7681] font-mono">{u.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`${roleBadge(u.role)} text-[10px] px-2 py-0.5 rounded font-mono font-bold`}>
                  {u.role}
                </span>
                <span className="text-[10px] text-[#484f58] font-mono hidden sm:block">
                  {new Date(u.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
