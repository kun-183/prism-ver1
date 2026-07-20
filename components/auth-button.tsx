"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignInButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // 리다이렉트되므로 setLoading(false)는 불필요.
  }

  return (
    <Button onClick={signIn} disabled={loading} size="lg" className="h-12 rounded-full bg-[#0071e3] px-6 text-white shadow-[0_10px_30px_rgba(0,113,227,.24)] hover:bg-[#0077ed]">
      {loading ? "이동 중…" : "Google로 계속하기"}
    </Button>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <Button onClick={signOut} variant="ghost" size="sm" disabled={loading} className="rounded-full text-[#6e6e73] hover:bg-black/[.05] hover:text-[#1d1d1f]">
      로그아웃
    </Button>
  );
}
