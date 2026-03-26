'use client';

import React, { useState, useEffect } from 'react';
import {
  Users, Shield, Eye, Edit3, Trash2, Check, X,
  Plus, Crown, UserCheck, UserX, Settings, ChevronDown,
  Loader2, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import {
  Role, ModuleId, MODULE_IDS, MODULE_LABELS, ROLE_COLORS, ROLE_LABELS,
  DEFAULT_PERMISSIONS,
} from '@/lib/permissions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${ROLE_COLORS[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

function PermIcon({ value }: { value: boolean }) {
  return value
    ? <Check size={11} className="text-brand-electric" />
    : <X size={11} className="text-brand-slate/20" />;
}

// ─── RolesManager ─────────────────────────────────────────────────────────────

export default function RolesManager() {
  const { user, role: myRole, refreshRole } = useAuth();
  const { currentProject } = useProject();
  const [activeSection, setActiveSection] = useState<'users' | 'permissions'>('users');

  // ── Users state ──
  const [users, setUsers]     = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState<Role>('viewer');
  const [inviting, setInviting]       = useState(false);
  const [inviteMsg, setInviteMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ── Permissions preview state (which role to show) ──
  const [previewRole, setPreviewRole] = useState<Role>('editor');

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, role')
      .order('role');
    if (data) {
      // Get emails from auth.users via RPC or admin — for now show user id truncated if no email
      const enriched: UserProfile[] = data.map((p: any) => ({
        id: p.id,
        email: p.id === user?.id ? (user?.email || 'tu cuenta') : `${p.id.slice(0, 8)}…`,
        full_name: p.full_name || 'Sin nombre',
        role: p.role as Role,
      }));
      // Put current user first
      enriched.sort((a, b) => (a.id === user?.id ? -1 : b.id === user?.id ? 1 : 0));
      setUsers(enriched);
    }
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setSaving(userId);
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      if (userId === user?.id) await refreshRole();
    }
    setSaving(null);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    // In Supabase, invite via admin API. Here we use signUp flow as a placeholder.
    const { error } = await supabase.auth.signUp({
      email: inviteEmail.trim(),
      password: Math.random().toString(36).slice(2) + 'Aa1!', // temp password
      options: { data: { invited_role: inviteRole } },
    });
    if (error) {
      setInviteMsg({ type: 'err', text: error.message });
    } else {
      setInviteMsg({ type: 'ok', text: `Invitación enviada a ${inviteEmail}` });
      setInviteEmail('');
      await loadUsers();
    }
    setInviting(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-brand-deep font-black text-2xl tracking-tight">Configuración & Roles</h2>
          <p className="text-brand-slate/50 text-xs font-medium mt-0.5">
            Proyecto: <span className="font-black text-brand-deep">{currentProject?.name || '—'}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {(['users', 'permissions'] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                activeSection === s
                  ? 'bg-brand-deep text-white shadow-lg shadow-brand-deep/20'
                  : 'bg-brand-cloud text-brand-slate/60 hover:bg-brand-cloud/80'
              }`}
            >
              {s === 'users' ? 'Usuarios' : 'Permisos'}
            </button>
          ))}
        </div>
      </div>

      {/* ── USERS section ── */}
      {activeSection === 'users' && (
        <div className="space-y-5">

          {/* Invite card */}
          {myRole === 'admin' && (
            <div className="bg-white rounded-2xl border border-brand-cloud p-5 shadow-sm">
              <h3 className="text-[11px] font-black text-brand-deep uppercase tracking-widest mb-4 flex items-center gap-2">
                <Plus size={13} /> Invitar colaborador
              </h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-[9px] font-black text-brand-slate/50 uppercase tracking-widest mb-1.5">Correo</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="colaborador@empresa.com"
                    className="w-full text-xs px-3 py-2 bg-brand-cloud border border-transparent rounded-xl outline-none focus:border-brand-electric transition-all text-brand-slate"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-brand-slate/50 uppercase tracking-widest mb-1.5">Rol</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as Role)}
                    className="text-xs px-3 py-2 bg-brand-cloud border border-transparent rounded-xl outline-none focus:border-brand-electric transition-all text-brand-slate font-bold"
                  >
                    <option value="viewer">Visualizador</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail}
                  className="px-5 py-2 bg-brand-deep text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-brand-electric transition-all shadow-md shadow-brand-deep/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {inviting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Invitar
                </button>
              </div>
              {inviteMsg && (
                <p className={`mt-3 text-xs font-medium ${inviteMsg.type === 'ok' ? 'text-brand-electric' : 'text-red-500'}`}>
                  {inviteMsg.text}
                </p>
              )}
            </div>
          )}

          {/* Users table */}
          <div className="bg-white rounded-2xl border border-brand-cloud shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-cloud">
              <h3 className="text-[11px] font-black text-brand-deep uppercase tracking-widest flex items-center gap-2">
                <Users size={13} /> Usuarios del sistema
              </h3>
              <button onClick={loadUsers} className="text-brand-slate/40 hover:text-brand-deep transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-brand-slate/30" />
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-brand-cloud/40">
                  <tr>
                    <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Usuario</th>
                    <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Nombre</th>
                    <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Rol actual</th>
                    {myRole === 'admin' && (
                      <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Cambiar rol</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-cloud/50">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-brand-cloud/20 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-brand-deep flex items-center justify-center shrink-0">
                            <span className="text-brand-electric text-[10px] font-black">
                              {u.full_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-xs text-brand-slate/60 font-medium">{u.email}</span>
                          {u.id === user?.id && (
                            <span className="text-[8px] font-black text-brand-orange uppercase tracking-widest bg-brand-orange/10 px-1.5 py-0.5 rounded-full border border-brand-orange/20">tú</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-bold text-brand-slate">{u.full_name}</td>
                      <td className="px-5 py-3.5">
                        <RoleBadge role={u.role} />
                      </td>
                      {myRole === 'admin' && (
                        <td className="px-5 py-3.5">
                          {u.id === user?.id ? (
                            <span className="text-[9px] text-brand-slate/30 italic">tu rol</span>
                          ) : saving === u.id ? (
                            <Loader2 size={13} className="animate-spin text-brand-electric" />
                          ) : (
                            <select
                              value={u.role}
                              onChange={e => handleRoleChange(u.id, e.target.value as Role)}
                              className="text-[10px] font-black bg-brand-cloud border border-transparent rounded-lg px-2 py-1 outline-none focus:border-brand-electric transition-all text-brand-slate cursor-pointer"
                            >
                              <option value="viewer">Visualizador</option>
                              <option value="editor">Editor</option>
                              <option value="admin">Administrador</option>
                            </select>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-brand-slate/30 text-xs italic">
                        No hay usuarios registrados aún
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── PERMISSIONS section ── */}
      {activeSection === 'permissions' && (
        <div className="space-y-5">

          {/* Role selector */}
          <div className="flex gap-3">
            {(['admin', 'editor', 'viewer'] as Role[]).map(r => (
              <button
                key={r}
                onClick={() => setPreviewRole(r)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${
                  previewRole === r
                    ? ROLE_COLORS[r] + ' shadow-sm'
                    : 'bg-brand-cloud text-brand-slate/40 border-transparent hover:bg-brand-cloud/80'
                }`}
              >
                {r === 'admin' && <Crown size={11} />}
                {r === 'editor' && <Edit3 size={11} />}
                {r === 'viewer' && <Eye size={11} />}
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          {/* Permissions matrix */}
          <div className="bg-white rounded-2xl border border-brand-cloud shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-brand-cloud">
              <h3 className="text-[11px] font-black text-brand-deep uppercase tracking-widest flex items-center gap-2">
                <Shield size={13} /> Permisos — <RoleBadge role={previewRole} />
              </h3>
              <p className="text-[10px] text-brand-slate/40 mt-1">
                Vista de sólo lectura. Los permisos de cada rol están definidos en el sistema.
              </p>
            </div>
            <table className="w-full">
              <thead className="bg-brand-cloud/40">
                <tr>
                  <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Módulo</th>
                  <th className="px-5 py-3 text-center text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Ver</th>
                  <th className="px-5 py-3 text-center text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Editar</th>
                  <th className="px-5 py-3 text-center text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Eliminar</th>
                  <th className="px-5 py-3 text-center text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-cloud/50">
                {MODULE_IDS.map(moduleId => {
                  const perms = DEFAULT_PERMISSIONS[previewRole][moduleId];
                  return (
                    <tr key={moduleId} className="hover:bg-brand-cloud/20 transition-colors">
                      <td className="px-5 py-3 text-xs font-bold text-brand-slate/80">{MODULE_LABELS[moduleId]}</td>
                      <td className="px-5 py-3 text-center"><PermIcon value={perms.canView} /></td>
                      <td className="px-5 py-3 text-center"><PermIcon value={perms.canEdit} /></td>
                      <td className="px-5 py-3 text-center"><PermIcon value={perms.canDelete} /></td>
                      <td className="px-5 py-3 text-center"><PermIcon value={perms.canManage} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Role descriptions */}
          <div className="grid grid-cols-3 gap-4">
            {([
              { role: 'admin' as Role, icon: Crown, desc: 'Acceso total. Gestiona usuarios, carga datos, crea vistas y administra el proyecto.' },
              { role: 'editor' as Role, icon: Edit3, desc: 'Puede cargar datos, editar registros y crear vistas. No accede a configuración.' },
              { role: 'viewer' as Role, icon: Eye, desc: 'Sólo visualización de dashboards, matrices, Gantt y exploradores.' },
            ]).map(({ role: r, icon: Icon, desc }) => (
              <div key={r} className={`rounded-2xl border p-4 ${ROLE_COLORS[r]}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} />
                  <span className="text-[11px] font-black uppercase tracking-widest">{ROLE_LABELS[r]}</span>
                </div>
                <p className="text-[10px] leading-relaxed opacity-70">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
