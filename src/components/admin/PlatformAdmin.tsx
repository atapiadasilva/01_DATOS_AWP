'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Users, FolderOpen, Plus, Archive, ArchiveRestore,
  Loader2, RefreshCw, UserPlus, UserMinus, ChevronDown, ChevronRight,
  Crown, Edit3, Eye, Trash2, Check, X, AlertCircle, Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProject, type Project, type ProjectMember } from '@/contexts/ProjectContext';
import { ROLE_COLORS, ROLE_LABELS, type Role } from '@/lib/permissions';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PlatformUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_platform_admin: boolean;
  status: 'active' | 'inactive';
  created_at: string;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${ROLE_COLORS[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

function StatusBadge({ status }: { status: 'active' | 'inactive' | 'archived' }) {
  const styles = {
    active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    inactive: 'bg-red-50 text-red-600 border-red-200',
    archived: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  const labels = { active: 'Activo', inactive: 'Inactivo', archived: 'Archivado' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ─── ProjectCard ───────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  platformUsers,
  onArchive,
}: {
  project: Project;
  platformUsers: PlatformUser[];
  onArchive: (id: string, archived: boolean) => void;
}) {
  const { getProjectMembers, addProjectMember, removeProjectMember, updateProjectMemberRole } = useProject();
  const [expanded, setExpanded]     = useState(false);
  const [members, setMembers]       = useState<ProjectMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [addUserId, setAddUserId]   = useState('');
  const [addRole, setAddRole]       = useState<Role>('viewer');
  const [saving, setSaving]         = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    const data = await getProjectMembers(project.id);
    setMembers(data);
    setLoadingMembers(false);
  }, [project.id, getProjectMembers]);

  useEffect(() => {
    if (expanded) loadMembers();
  }, [expanded, loadMembers]);

  const handleAdd = async () => {
    if (!addUserId) return;
    setSaving(true);
    const ok = await addProjectMember(project.id, addUserId, addRole);
    if (ok) { await loadMembers(); setAddUserId(''); }
    setSaving(false);
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    await removeProjectMember(project.id, userId);
    setMembers(prev => prev.filter(m => m.user_id !== userId));
    setRemovingId(null);
  };

  const handleRoleChange = async (userId: string, role: Role) => {
    await updateProjectMemberRole(project.id, userId, role);
    setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role } : m));
  };

  const availableToAdd = platformUsers.filter(u =>
    u.status === 'active' && !members.some(m => m.user_id === u.id)
  );

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      project.status === 'archived' ? 'border-slate-200 opacity-70' : 'border-brand-cloud'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            project.status === 'archived' ? 'bg-slate-100' : 'bg-brand-deep/5'
          }`}>
            <Building2 size={16} className={project.status === 'archived' ? 'text-slate-400' : 'text-brand-deep'} />
          </div>
          <div>
            <p className="text-sm font-black text-brand-deep leading-none">{project.name}</p>
            {project.description && (
              <p className="text-[10px] text-brand-slate/50 mt-0.5 font-medium">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
          <button
            onClick={() => onArchive(project.id, project.status === 'active')}
            title={project.status === 'active' ? 'Archivar' : 'Restaurar'}
            className="p-1.5 rounded-lg text-brand-slate/30 hover:text-brand-slate/70 hover:bg-brand-cloud transition-all"
          >
            {project.status === 'active'
              ? <Archive size={13} />
              : <ArchiveRestore size={13} />}
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-cloud text-brand-slate/60 hover:text-brand-deep text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
          >
            <Users size={11} />
            Miembros
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        </div>
      </div>

      {/* Members panel */}
      {expanded && (
        <div className="border-t border-brand-cloud px-5 py-4 space-y-4 bg-brand-cloud/20">
          {loadingMembers ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-brand-slate/30" />
            </div>
          ) : (
            <>
              {/* Current members */}
              {members.length > 0 ? (
                <div className="space-y-1.5">
                  {members.map(m => (
                    <div key={m.user_id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-brand-cloud">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand-deep flex items-center justify-center shrink-0">
                          <span className="text-brand-electric text-[10px] font-black">
                            {(m.full_name || m.email).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-brand-deep leading-none">{m.full_name || '—'}</p>
                          <p className="text-[10px] text-brand-slate/50 mt-0.5">{m.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={m.role}
                          onChange={e => handleRoleChange(m.user_id, e.target.value as Role)}
                          className="text-[10px] font-black bg-brand-cloud border border-transparent rounded-lg px-2 py-1 outline-none focus:border-brand-electric transition-all text-brand-slate cursor-pointer"
                        >
                          <option value="viewer">Visualizador</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Administrador</option>
                        </select>
                        {removingId === m.user_id ? (
                          <Loader2 size={13} className="animate-spin text-brand-slate/30" />
                        ) : (
                          <button
                            onClick={() => handleRemove(m.user_id)}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <UserMinus size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] italic text-brand-slate/30 text-center py-2">Sin miembros asignados</p>
              )}

              {/* Add member */}
              {availableToAdd.length > 0 && (
                <div className="flex gap-2 items-end pt-1">
                  <div className="flex-1">
                    <label className="block text-[9px] font-black text-brand-slate/50 uppercase tracking-widest mb-1">Usuario</label>
                    <select
                      value={addUserId}
                      onChange={e => setAddUserId(e.target.value)}
                      className="w-full text-[11px] font-medium px-3 py-2 bg-white border border-brand-cloud rounded-xl outline-none focus:border-brand-electric transition-all text-brand-slate"
                    >
                      <option value="">Seleccionar usuario…</option>
                      {availableToAdd.map(u => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-brand-slate/50 uppercase tracking-widest mb-1">Rol</label>
                    <select
                      value={addRole}
                      onChange={e => setAddRole(e.target.value as Role)}
                      className="text-[11px] font-bold px-3 py-2 bg-white border border-brand-cloud rounded-xl outline-none focus:border-brand-electric transition-all text-brand-slate"
                    >
                      <option value="viewer">Visualizador</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <button
                    onClick={handleAdd}
                    disabled={saving || !addUserId}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-deep text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-brand-electric transition-all shadow-md shadow-brand-deep/20 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                    Agregar
                  </button>
                </div>
              )}
              {availableToAdd.length === 0 && members.length > 0 && (
                <p className="text-[10px] italic text-brand-slate/30 text-center">Todos los usuarios ya son miembros</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PlatformAdmin ─────────────────────────────────────────────────────────────

export default function PlatformAdmin() {
  const { user, session, isPlatformAdmin } = useAuth();
  const { projects, createProject, archiveProject, refreshProjects } = useProject();

  const [activeTab, setActiveTab]     = useState<'projects' | 'users'>('projects');
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [loadingUsers, setLoadingUsers]   = useState(false);

  // ── New project form ──
  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName]   = useState('');
  const [newDesc, setNewDesc]   = useState('');
  const [creating, setCreating] = useState(false);

  // ── Invite form ──
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole, setInviteRole]     = useState<Role>('viewer');
  const [inviting, setInviting]         = useState(false);
  const [inviteMsg, setInviteMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ── User actions ──
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const loadPlatformUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data } = await supabase.rpc('get_platform_users');
    setPlatformUsers((data as PlatformUser[]) || []);
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    if (isPlatformAdmin) loadPlatformUsers();
  }, [isPlatformAdmin, loadPlatformUsers]);

  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-10">
          <AlertCircle size={40} className="text-brand-slate/20 mx-auto mb-4" />
          <p className="text-brand-slate/40 text-sm font-medium">Acceso restringido</p>
        </div>
      </div>
    );
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleCreateProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    await createProject(newName.trim(), newDesc.trim() || undefined);
    setNewName(''); setNewDesc(''); setShowNewProject(false);
    await refreshProjects();
    setCreating(false);
  };

  const handleArchive = async (id: string, archive: boolean) => {
    await archiveProject(id, archive);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !session?.access_token) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteMsg({ type: 'err', text: json.error || 'Error al invitar' });
      } else {
        setInviteMsg({ type: 'ok', text: `Invitación enviada a ${inviteEmail}` });
        setInviteEmail('');
        await loadPlatformUsers();
      }
    } catch {
      setInviteMsg({ type: 'err', text: 'Error de red' });
    }
    setInviting(false);
  };

  const handleToggleStatus = async (userId: string, currentStatus: 'active' | 'inactive') => {
    setSavingUserId(userId);
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const { error } = await supabase
      .from('user_profiles')
      .update({ status: newStatus })
      .eq('id', userId);
    if (!error) {
      setPlatformUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
    }
    setSavingUserId(null);
  };

  const handleGlobalRoleChange = async (userId: string, role: Role) => {
    setSavingUserId(userId);
    const { error } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', userId);
    if (!error) {
      setPlatformUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    }
    setSavingUserId(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const activeProjects   = projects.filter(p => p.status === 'active');
  const archivedProjects = projects.filter(p => p.status === 'archived');

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-deep to-brand-electric flex items-center justify-center shadow-lg shadow-brand-deep/20">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-brand-deep font-black text-2xl tracking-tight">Administración de Plataforma</h2>
            <p className="text-brand-slate/40 text-[10px] font-black uppercase tracking-widest mt-0.5">
              datapower4D · Control total
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['projects', 'users'] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                activeTab === t
                  ? 'bg-brand-deep text-white shadow-lg shadow-brand-deep/20'
                  : 'bg-brand-cloud text-brand-slate/60 hover:bg-brand-cloud/80'
              }`}
            >
              {t === 'projects' ? <><FolderOpen size={12} /> Proyectos</> : <><Users size={12} /> Usuarios</>}
            </button>
          ))}
        </div>
      </div>

      {/* ── PROJECTS TAB ── */}
      {activeTab === 'projects' && (
        <div className="space-y-4">

          {/* New project action */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-brand-slate/40 uppercase tracking-widest">
              {activeProjects.length} activo{activeProjects.length !== 1 ? 's' : ''} · {archivedProjects.length} archivado{archivedProjects.length !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => refreshProjects()}
                className="p-2 text-brand-slate/30 hover:text-brand-deep hover:bg-brand-cloud rounded-xl transition-all"
              >
                <RefreshCw size={13} />
              </button>
              <button
                onClick={() => setShowNewProject(s => !s)}
                className="flex items-center gap-2 px-4 py-2 bg-brand-deep text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-brand-electric transition-all shadow-md shadow-brand-deep/20"
              >
                <Plus size={12} /> Nuevo Proyecto
              </button>
            </div>
          </div>

          {/* New project form */}
          {showNewProject && (
            <div className="bg-white rounded-2xl border border-brand-electric/30 p-5 shadow-sm space-y-4">
              <h3 className="text-[11px] font-black text-brand-deep uppercase tracking-widest flex items-center gap-2">
                <Plus size={13} /> Crear nuevo proyecto
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-brand-slate/50 uppercase tracking-widest mb-1.5">Nombre *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Ej: Proyecto Norte, Planta Beta…"
                    className="w-full text-xs px-3 py-2 bg-brand-cloud border border-transparent rounded-xl outline-none focus:border-brand-electric transition-all text-brand-slate"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-brand-slate/50 uppercase tracking-widest mb-1.5">Descripción</label>
                  <input
                    type="text"
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Descripción breve (opcional)"
                    className="w-full text-xs px-3 py-2 bg-brand-cloud border border-transparent rounded-xl outline-none focus:border-brand-electric transition-all text-brand-slate"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowNewProject(false); setNewName(''); setNewDesc(''); }}
                  className="px-4 py-2 bg-brand-cloud text-brand-slate/60 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-brand-cloud/80 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={creating || !newName.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 bg-brand-deep text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-brand-electric transition-all shadow-md shadow-brand-deep/20 disabled:opacity-50"
                >
                  {creating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Crear
                </button>
              </div>
            </div>
          )}

          {/* Active projects */}
          <div className="space-y-3">
            {activeProjects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                platformUsers={platformUsers}
                onArchive={handleArchive}
              />
            ))}
            {activeProjects.length === 0 && (
              <p className="text-center text-brand-slate/30 text-xs italic py-8">Sin proyectos activos</p>
            )}
          </div>

          {/* Archived projects */}
          {archivedProjects.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-brand-slate/30 uppercase tracking-widest pt-2">Archivados</p>
              {archivedProjects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  platformUsers={platformUsers}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'users' && (
        <div className="space-y-5">

          {/* Invite form */}
          <div className="bg-white rounded-2xl border border-brand-cloud p-5 shadow-sm">
            <h3 className="text-[11px] font-black text-brand-deep uppercase tracking-widest mb-4 flex items-center gap-2">
              <UserPlus size={13} /> Invitar nuevo usuario
            </h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-[9px] font-black text-brand-slate/50 uppercase tracking-widest mb-1.5">Correo electrónico</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  placeholder="usuario@empresa.com"
                  className="w-full text-xs px-3 py-2 bg-brand-cloud border border-transparent rounded-xl outline-none focus:border-brand-electric transition-all text-brand-slate"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black text-brand-slate/50 uppercase tracking-widest mb-1.5">Rol global</label>
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
                disabled={inviting || !inviteEmail.trim()}
                className="flex items-center gap-1.5 px-5 py-2 bg-brand-deep text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-brand-electric transition-all shadow-md shadow-brand-deep/20 disabled:opacity-50"
              >
                {inviting ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                Invitar
              </button>
            </div>
            {inviteMsg && (
              <p className={`mt-3 text-xs font-medium flex items-center gap-1.5 ${inviteMsg.type === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>
                {inviteMsg.type === 'ok' ? <Check size={12} /> : <AlertCircle size={12} />}
                {inviteMsg.text}
              </p>
            )}
          </div>

          {/* Users table */}
          <div className="bg-white rounded-2xl border border-brand-cloud shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-cloud">
              <h3 className="text-[11px] font-black text-brand-deep uppercase tracking-widest flex items-center gap-2">
                <Users size={13} /> Usuarios de la plataforma
                <span className="text-brand-slate/30 font-medium normal-case tracking-normal text-[10px]">
                  ({platformUsers.length})
                </span>
              </h3>
              <button onClick={loadPlatformUsers} className="text-brand-slate/40 hover:text-brand-deep transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>

            {loadingUsers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-brand-slate/30" />
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-brand-cloud/40">
                  <tr>
                    <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Usuario</th>
                    <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Nombre</th>
                    <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Rol global</th>
                    <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Estado</th>
                    <th className="px-5 py-3 text-left text-[9px] font-black text-brand-slate/50 uppercase tracking-widest">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-cloud/50">
                  {platformUsers.map(u => (
                    <tr key={u.id} className="hover:bg-brand-cloud/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            u.is_platform_admin ? 'bg-brand-orange' : 'bg-brand-deep'
                          }`}>
                            {u.is_platform_admin
                              ? <Crown size={13} className="text-white" />
                              : <span className="text-brand-electric text-[10px] font-black">{(u.full_name || u.email).charAt(0).toUpperCase()}</span>
                            }
                          </div>
                          <div>
                            <p className="text-xs font-medium text-brand-slate/70 leading-none">{u.email}</p>
                            {u.is_platform_admin && (
                              <span className="text-[8px] font-black text-brand-orange uppercase tracking-widest">Platform Admin</span>
                            )}
                            {u.id === user?.id && (
                              <span className="text-[8px] font-black text-brand-orange uppercase tracking-widest bg-brand-orange/10 px-1.5 py-0.5 rounded-full border border-brand-orange/20 ml-1">tú</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-bold text-brand-slate">{u.full_name || '—'}</td>
                      <td className="px-5 py-3.5">
                        {savingUserId === u.id ? (
                          <Loader2 size={13} className="animate-spin text-brand-electric" />
                        ) : u.is_platform_admin ? (
                          <RoleBadge role={u.role} />
                        ) : (
                          <select
                            value={u.role}
                            onChange={e => handleGlobalRoleChange(u.id, e.target.value as Role)}
                            disabled={u.id === user?.id}
                            className="text-[10px] font-black bg-brand-cloud border border-transparent rounded-lg px-2 py-1 outline-none focus:border-brand-electric transition-all text-brand-slate cursor-pointer disabled:opacity-50"
                          >
                            <option value="viewer">Visualizador</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Administrador</option>
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        {u.id !== user?.id && !u.is_platform_admin && (
                          <button
                            onClick={() => handleToggleStatus(u.id, u.status)}
                            disabled={savingUserId === u.id}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                              u.status === 'active'
                                ? 'bg-red-50 text-red-500 hover:bg-red-100'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            }`}
                          >
                            {u.status === 'active' ? <><UserMinus size={10} /> Desactivar</> : <><UserPlus size={10} /> Activar</>}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {platformUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-brand-slate/30 text-xs italic">
                        No hay usuarios registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
