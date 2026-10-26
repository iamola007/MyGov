import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import type { Profile } from "@/types/database";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Pick<Profile, "username"> | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  }

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
      <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="font-bold text-lg text-gray-900">
          MyGov
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/posts/new"
            className="text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-md px-3 py-1.5"
          >
            New post
          </Link>

          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 hidden sm:inline">
                {profile?.username ?? user.email}
              </span>
              <SignOutButton />
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Link href="/login" className="text-gray-600 hover:text-gray-900">
                Log in
              </Link>
              <Link href="/signup" className="text-gray-600 hover:text-gray-900">
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
