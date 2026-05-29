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

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function POST() {
  if (!isSupabaseConfigured || !process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "서버 환경변수가 설정되지 않았습니다(Supabase / Anthropic)." },
      { status: 503 },
    );
  }

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

  const branches: BranchInput[] = (branchesRaw ?? []).map(
    (b: { id: string; idea: string; comments: { body: string }[] | null }) => ({
      id: b.id,
      idea: b.idea,
      comments: (b.comments ?? []).map((c) => c.body),
    }),
  );

  if (branches.length < 2) {
    return Response.json(
      { error: "합성하려면 가지가 최소 2개 필요합니다." },
      { status: 400 },
    );
  }

  const anthropic = new Anthropic(); // ANTHROPIC_API_KEY 환경변수 사용
  const model = process.env.SYNTHESIS_MODEL ?? "claude-sonnet-4-6";
  const userContent = JSON.stringify({ branches });

  async function callModel(prefill: boolean): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userContent },
    ];
    if (prefill) messages.push({ role: "assistant", content: "{" });

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
      messages,
    });

    const text = extractText(msg);
    return prefill ? "{" + text : text;
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
    result = tryParse(await callModel(true)); // 1차: JSON 프리필
    if (!result) result = tryParse(await callModel(false)); // 재시도: 프리필 없이
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
