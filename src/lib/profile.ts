import type { SupabaseClient, User } from "@supabase/supabase-js";

// Profile provisioning strategy
// ------------------------------
// schema.sql ships an RLS policy "Users can insert their own profile" that
// checks `auth.uid() = id`. That policy only makes sense if the profile row
// is inserted by the client using the user's own session (a Postgres trigger
// on auth.users, running as the table owner, would bypass RLS entirely and
// wouldn't need that policy to exist). So we treat client-side provisioning
// as the intended, standard pattern here — no extra DB migration required
// beyond the fixed schema.
//
// We call this in two places to cover both auth flows:
//  1. Right after supabase.auth.signUp(), when email confirmation is
//     disabled and a session comes back immediately.
//  2. In the auth callback route (and defensively on login), for the case
//     where the user must confirm their email before a session exists.
// It's idempotent — if a profile already exists for this user, it's a no-op.
export async function ensureProfile(
  supabase: SupabaseClient,
  user: User
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return { error: null };

  const fallbackUsername =
    (user.user_metadata?.username as string | undefined) ||
    user.email?.split("@")[0] ||
    `citizen_${user.id.slice(0, 8)}`;

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    username: fallbackUsername,
  });

  // A unique-violation on username (23505) means another account already
  // took it; that's a pre-existing edge case for this MVP (the signup form
  // is the normal place username uniqueness gets surfaced to the user).
  if (error && error.code !== "23505") {
    return { error: error.message };
  }
  return { error: null };
}
