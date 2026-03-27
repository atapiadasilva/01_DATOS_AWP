'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  Role, ModuleId, ModulePermission, DEFAULT_PERMISSIONS,
} from '@/lib/permissions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: Role;
  isPlatformAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasPermission: (module: ModuleId, permission: keyof ModulePermission) => boolean;
  refreshRole: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]                   = useState<User | null>(null);
  const [session, setSession]             = useState<Session | null>(null);
  const [loading, setLoading]             = useState(true);
  const [role, setRole]                   = useState<Role>('viewer');
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const loadUserRole = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('role, is_platform_admin')
        .eq('id', userId)
        .single();
      setRole((data?.role as Role) || 'viewer');
      setIsPlatformAdmin(data?.is_platform_admin ?? false);
    } catch {
      setRole('viewer');
      setIsPlatformAdmin(false);
    }
  }, []);

  useEffect(() => {
    // Timeout de seguridad: si Supabase no responde en 6s, liberar loading
    const timeout = setTimeout(() => setLoading(false), 3000);

    // onAuthStateChange dispara INITIAL_SESSION en Supabase v2 — es la forma más confiable
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadUserRole(s.user.id);
      else setRole('viewer');
      // INITIAL_SESSION es el primer evento — libera el loading
      if (event === 'INITIAL_SESSION') {
        clearTimeout(timeout);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [loadUserRole]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ error: string | null }> => {
    // Pass full_name in metadata so the DB trigger (handle_new_user) picks it up.
    // The trigger uses ON CONFLICT DO NOTHING, so no duplicate profile is created.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    setIsPlatformAdmin(false);
    await supabase.auth.signOut();
  };

  const refreshRole = async () => {
    if (user) await loadUserRole(user.id);
  };

  const hasPermission = (module: ModuleId, permission: keyof ModulePermission): boolean => {
    return DEFAULT_PERMISSIONS[role]?.[module]?.[permission] ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, isPlatformAdmin, signIn, signUp, signOut, hasPermission, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
