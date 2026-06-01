import Anthropic from "@anthropic-ai/sdk";
import {
  SYNTHESIS_SYSTEM_PROMPT,
  type SynthesisResult,
} from "@/lib/synthesis-prompt";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
// 합성은 요청 시점에 실행되어야 하므로 캐시 금지.
export const dynamic = "force-dynamic";

type BranchInput = { id: string; idea: string; comments: string[] };

// 클라이언트가 보내는 모델 키 → 실제 모델 ID. 화이트리스트로만 허용.
const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
};

type SynthesizeBody = { model?: string; branchIds?: string[] };

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

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

  if (branches.length < 2) {
    return Response.json(
      { error: "합성하려면 가지를 최소 2개 선택해야 합니다." },
      { status: 400 },
    );
  }

  const anthropic = new Anthropic(); // ANTHROPIC_API_KEY 환경변수 사용
  // 모델 키(haiku/sonnet/opus)는 화이트리스트로만 허용, 없으면 기본값.
  const model =
    MODEL_MAP[body.model ?? ""] ??
    process.env.SYNTHESIS_MODEL ??
    "claude-sonnet-4-6";
  const userContent = JSON.stringify({ branches });

  // 주의: 일부 최신 모델(claude-sonnet-4-6 등)은 assistant 프리필을 지원하지 않는다
  // ("conversation must end with a user message"). 따라서 프리필 없이 호출하고,
  // 시스템 프롬프트의 "JSON만 출력" 지시 + tryParse(펜스 제거)로 JSON을 회수한다.
  async function callModel(): Promise<string> {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: SYNTHESIS_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" }, // 긴 시스템 프롬프트 캐싱
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    return extractText(msg);
  }

  function tryParse(raw: string): SynthesisResult | null {
    try {
      // 혹시 모를 마크다운 펜스 제거 후 파싱
      const clean = raw.replace(/```json|```/g, "").trim();
      return JSON.parse(clean) as SynthesisResult;
    } catch {
      return null;
    }
  }

  let result: SynthesisResult | null = null;
  try {
    result = tryParse(await callModel()); // 1차
    if (!result) result = tryParse(await callModel()); // 재시도(JSON 파싱 실패 시)
  } catch (e) {
    return Response.json(
      {
        error: "합성 엔진 호출에 실패했습니다. 다시 시도해 주세요.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

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
