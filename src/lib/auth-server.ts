import { createClient, type User, type SupabaseClient } from '@supabase/supabase-js';

export interface AuthResult {
  user: User;
  client: SupabaseClient;
}

/**
 * Validates the Bearer token from the Authorization header.
 * Returns { user, client } where client is scoped to the user's JWT so all
 * queries go through RLS automatically.
 * Returns null if the token is missing or invalid.
 */
export async function requireAuth(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return null;

  // Build a per-request client that carries the user's JWT.
  // Supabase will evaluate RLS policies against auth.uid() for every query.
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;

  return { user, client };
}
