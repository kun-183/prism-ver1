import Anthropic from "@anthropic-ai/sdk";
import { SYNTHESIS_SYSTEM_PROMPT } from "@/lib/synthesis-prompt";
import { runSynthesis, type BranchInput } from "@/lib/synthesis-engine";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
// 합성은 요청 시점에 실행되어야 하므로 캐시 금지.
export const dynamic = "force-dynamic";

// 클라이언트가 보내는 모델 키 → 실제 모델 ID. 화이트리스트로만 허용.
const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
};

type SynthesizeBody = { model?: string; branchIds?: string[]; pin?: string };

export async function POST(request: Request) {
  if (!isSupabaseConfigured || !process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "서버 환경변수가 설정되지 않았습니다(Supabase / Anthropic)." },
      { status: 503 },
    );
  }

  const body: SynthesizeBody = await request
    .json()
    .catch(() => ({}) as SynthesizeBody);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // 돌려보기 잠금: 서버의 4자리 PIN과 일치해야만 합성을 허용한다.
  // (크레딧 보호 — 로그인한 사용자 중에서도 PIN을 아는 사람만 실행 가능.)
  // SYNTHESIS_PIN 미설정 시 항상 차단(fail-closed).
  if (!process.env.SYNTHESIS_PIN || body.pin !== process.env.SYNTHESIS_PIN) {
    return Response.json(
      { error: "PIN이 올바르지 않습니다." },
      { status: 403 },
    );
  }

  // 전체 가지 + 잔가지 조회 (RLS 적용된 사용자 세션으로)
  const { data: branchesRaw, error } = await supabase
    .from("branches")
    .select("id, idea, comments(body)")
    .order("created_at");

  if (error) {
    return Response.json(
      { error: "가지를 불러오지 못했습니다.", detail: error.message },
      { status: 500 },
    );
  }

  const allBranches: BranchInput[] = (branchesRaw ?? []).map(
    (b: { id: string; idea: string; comments: { body: string }[] | null }) => ({
      id: b.id,
      idea: b.idea,
      comments: (b.comments ?? []).map((c) => c.body),
    }),
  );

  // 선택된 가지가 있으면 그것만, 없으면 전체로 합성한다.
  const selectedIds = Array.isArray(body.branchIds) ? body.branchIds : [];
  const branches =
    selectedIds.length > 0
      ? allBranches.filter((b) => selectedIds.includes(b.id))
      : allBranches;

  if (branches.length === 0) {
    return Response.json(
      { error: "합성할 가지를 선택하세요." },
      { status: 400 },
    );
  }

  const anthropic = new Anthropic(); // ANTHROPIC_API_KEY 환경변수 사용
  // 모델 키(haiku/sonnet/opus)는 화이트리스트로만 허용, 없으면 기본값.
  const model =
    MODEL_MAP[body.model ?? ""] ??
    process.env.SYNTHESIS_MODEL ??
    "claude-sonnet-4-6";

  let run: Awaited<ReturnType<typeof runSynthesis>>;
  try {
    run = await runSynthesis({
      anthropic,
      model,
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      branches,
    });
  } catch (e) {
    return Response.json(
      {
        error: "합성 엔진 호출에 실패했습니다. 다시 시도해 주세요.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  const result = run.result;
  if (!result) {
    return Response.json(
      { error: "합성 결과를 해석하지 못했습니다. 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  // 돌려보기 로그 저장 (실패해도 결과 반환은 막지 않음)
  await supabase.from("synthesis_runs").insert({
    input_branch_ids: branches.map((b) => b.id),
    result,
  });

  return Response.json(result);
}
