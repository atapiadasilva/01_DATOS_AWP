// ─── Role & Permission definitions ────────────────────────────────────────────

export type Role = 'admin' | 'editor' | 'viewer';

export interface ModulePermission {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean; // admin-only: manage users, settings, roles
}

export const MODULE_IDS = [
  'cwp-dashboard',
  'tree',
  'upload',
  'pwps',
  'modeling',
  'views',
  'programming',
  'explorer',
  'matrix',
  'audit',
  'drawing-log',
  'gantt',
  'settings',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export const MODULE_LABELS: Record<ModuleId, string> = {
  'cwp-dashboard': 'Dashboard CWPs',
  tree: 'Índice Maestro AWP',
  upload: 'Carga de Datos',
  pwps: 'Edición Maestra',
  modeling: 'Modelado de Red',
  views: 'Vistas Dinámicas',
  programming: 'Programación',
  explorer: 'Explorador Relacional',
  matrix: 'Matriz de Seguimiento',
  audit: 'Auditoría de Integridad',
  'drawing-log': 'Log de Planos',
  gantt: 'Carta Gantt',
  settings: 'Configuración & Roles',
};

// ─── Default permissions per role ─────────────────────────────────────────────

const adminPerms: ModulePermission = { canView: true, canEdit: true, canDelete: true, canManage: true };
const editorPerms: ModulePermission = { canView: true, canEdit: true, canDelete: false, canManage: false };
const viewerPerms: ModulePermission = { canView: true, canEdit: false, canDelete: false, canManage: false };

export const DEFAULT_PERMISSIONS: Record<Role, Record<ModuleId, ModulePermission>> = {
  admin: Object.fromEntries(MODULE_IDS.map(id => [id, adminPerms])) as Record<ModuleId, ModulePermission>,

  editor: Object.fromEntries(
    MODULE_IDS.map(id => [
      id,
      id === 'settings'
        ? { canView: false, canEdit: false, canDelete: false, canManage: false }
        : id === 'upload' || id === 'pwps'
        ? { canView: true, canEdit: true, canDelete: true, canManage: false }
        : editorPerms,
    ]),
  ) as Record<ModuleId, ModulePermission>,

  viewer: Object.fromEntries(
    MODULE_IDS.map(id => [
      id,
      id === 'settings' || id === 'upload'
        ? { canView: false, canEdit: false, canDelete: false, canManage: false }
        : viewerPerms,
    ]),
  ) as Record<ModuleId, ModulePermission>,
};

// ─── Role badge colors ─────────────────────────────────────────────────────────

export const ROLE_COLORS: Record<Role, string> = {
  admin:  'bg-brand-orange/10 text-brand-orange border-brand-orange/30',
  editor: 'bg-brand-electric/10 text-brand-electric border-brand-electric/30',
  viewer: 'bg-brand-slate/10 text-brand-slate border-brand-slate/20',
};

export const ROLE_LABELS: Record<Role, string> = {
  admin:  'Administrador',
  editor: 'Editor',
  viewer: 'Visualizador',
};
