import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { CatalystReaction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REACTIONS = new Set<CatalystReaction>(["pulled", "uneasy", "missing"]);

type ReactionBody = {
  runId?: string;
  reaction?: CatalystReaction;
  note?: string;
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return Response.json({ error: "서버 환경변수가 설정되지 않았습니다." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as ReactionBody | null;
  const note = body?.note?.trim() ?? "";
  if (
    !body?.runId ||
    !body.reaction ||
    !REACTIONS.has(body.reaction) ||
    note.length > 1000
  ) {
    return Response.json({ error: "반응 기록 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await supabase.from("synthesis_reactions").upsert(
    {
      synthesis_run_id: body.runId,
      author_id: user.id,
      reaction: body.reaction,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "synthesis_run_id,author_id" },
  );
  if (error) {
    return Response.json(
      { error: "반응을 기록하지 못했습니다.", detail: error.message },
      { status: 500 },
    );
  }

  const { count } = await supabase
    .from("synthesis_reactions")
    .select("id", { count: "exact", head: true })
    .eq("synthesis_run_id", body.runId);

  return Response.json({ recorded: true, reaction_count: count ?? 1 });
}
