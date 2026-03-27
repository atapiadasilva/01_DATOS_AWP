import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-server';

export const runtime = 'edge';

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify caller is platform admin
  const { data: profile } = await auth.client
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', auth.user.id)
    .single();

  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, role = 'viewer' } = await req.json();
  if (!email?.trim()) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured: missing service key' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
    data: { invited_role: role },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } });
}
