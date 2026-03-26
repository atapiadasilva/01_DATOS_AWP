'use client';

import React, { useState } from 'react';
import { Network, Eye, EyeOff, Loader2, ArrowRight, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// ─── LoginPage ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode]           = useState<'login' | 'register'>('login');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [fullName, setFullName]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (mode === 'login') {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
    } else {
      if (!fullName.trim()) { setError('Ingresa tu nombre completo'); setLoading(false); return; }
      if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); setLoading(false); return; }
      const { error: err } = await signUp(email, password, fullName);
      if (err) setError(err);
      else setSuccess('Cuenta creada. Revisa tu correo para verificar tu cuenta.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-deep via-[#112266] to-[#0a1a3d] flex items-center justify-center p-4">
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(#00BFFF 1px,transparent 1px),linear-gradient(90deg,#00BFFF 1px,transparent 1px)', backgroundSize: '40px 40px' }}
      />

      {/* Card */}
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-brand-electric/10 border border-brand-electric/30 flex items-center justify-center mb-4 shadow-xl shadow-brand-electric/10">
            <Network className="text-brand-electric" size={32} />
          </div>
          <h1 className="text-white font-black text-[26px] tracking-tight italic uppercase select-none">
            data<span className="text-brand-electric">power</span><span className="text-brand-orange">4D</span>
          </h1>
          <p className="text-white/30 text-[11px] font-black uppercase tracking-widest mt-1">AWP Ecosystem</p>
        </div>

        {/* Form card */}
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/30">
          <h2 className="text-white font-black text-lg mb-1">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h2>
          <p className="text-white/40 text-[11px] font-medium mb-6">
            {mode === 'login'
              ? 'Accede a tu ecosistema AWP'
              : 'Únete al ecosistema datapower4D'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-[10px] font-black text-white/50 uppercase tracking-widest mb-1.5">
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-brand-electric/50 focus:bg-white/10 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-white/50 uppercase tracking-widest mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-brand-electric/50 focus:bg-white/10 transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-white/50 uppercase tracking-widest mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-white/20 outline-none focus:border-brand-electric/50 focus:bg-white/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-xs font-medium">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-brand-electric/10 border border-brand-electric/20 rounded-xl px-4 py-3 text-brand-electric text-xs font-medium">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-electric text-brand-deep font-black text-[13px] uppercase tracking-widest py-3.5 rounded-xl hover:bg-brand-electric/90 transition-all shadow-lg shadow-brand-electric/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading
                ? <Loader2 size={16} className="animate-spin" />
                : mode === 'login'
                  ? <><ArrowRight size={16} /> Entrar</>
                  : <><UserPlus size={16} /> Crear cuenta</>}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="mt-6 pt-5 border-t border-white/5 text-center">
            <span className="text-white/30 text-xs">
              {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
            </span>
            {' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setSuccess(null); }}
              className="text-brand-electric text-xs font-black hover:underline"
            >
              {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
            </button>
          </div>
        </div>

        <p className="text-center text-white/20 text-[10px] font-black uppercase tracking-widest mt-6">
          datapower4D &copy; {new Date().getFullYear()} — AWP Ecosystem
        </p>
      </div>
    </div>
  );
}
