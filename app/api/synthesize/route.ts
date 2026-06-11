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

type SynthesizeBody = { model?: string; branchIds?: string[]; pin?: string };

type DimensionStage = {
  dimensions: string[];
  diversity_warning?: string | null;
  refusal_reason?: string | null;
};

type OrthogonalityStage = {
  orthogonal_pairs: SynthesisResult["orthogonal_pairs"];
  diversity_warning?: string | null;
  refusal_reason?: string | null;
};

type XStage = {
  synthesis_possible: boolean;
  X: string;
  diversity_warning?: string | null;
  refusal_reason?: string | null;
};

type ContributionStage = {
  contribution: SynthesisResult["contribution"];
  valid?: boolean;
  diversity_warning?: string | null;
  refusal_reason?: string | null;
};

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

  // 주의: 일부 최신 모델(claude-sonnet-4-6 등)은 assistant 프리필을 지원하지 않는다
  // ("conversation must end with a user message"). 따라서 프리필 없이 호출하고,
  // 시스템 프롬프트의 "JSON만 출력" 지시 + tryParse(펜스 제거)로 JSON을 회수한다.
  async function callModel(
    userContent: string,
    systemPrompt = SYNTHESIS_SYSTEM_PROMPT,
  ): Promise<string> {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" }, // 긴 시스템 프롬프트 캐싱
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    return extractText(msg);
  }

  function tryParse<T>(raw: string): T | null {
    try {
      // 혹시 모를 마크다운 펜스 제거 후 파싱
      const clean = raw.replace(/```json|```/g, "").trim();
      return JSON.parse(clean) as T;
    } catch {
      return null;
    }
  }

  // 각 단계는 원본 입력만 받는 독립 호출이다. 이전 단계 결과를 넘기지 않는다.
  async function callStage<T>({
    stage,
    task,
    outputSchema,
  }: {
    stage: string;
    task: string;
    outputSchema: Record<string, unknown>;
  }): Promise<T | null> {
    const systemPrompt = `${SYNTHESIS_SYSTEM_PROMPT}

[독립 단계 호출]
이번 API 호출은 "${stage}" 단계만 수행한다.
다른 단계의 답변을 가정하거나 이어받지 않는다.
원본 입력 branches만 사용한다.
반드시 아래 output_schema와 같은 JSON 객체만 출력한다.
${JSON.stringify(outputSchema)}`;

    const content = JSON.stringify({
      mode: "independent_synthesis_stage",
      independence_rule:
        "This API call must use only the branches in this payload. Do not assume, reuse, or depend on any answer from another stage/session.",
      stage,
      task,
      branches,
    });
    let r = tryParse<T>(await callModel(content, systemPrompt));
    if (!r) r = tryParse<T>(await callModel(content, systemPrompt));
    return r;
  }

  function joinWarnings(
    values: Array<string | null | undefined>,
  ): string | null {
    const warnings = values.filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    return warnings.length > 0 ? warnings.join(" / ") : null;
  }

  let result: SynthesisResult | null = null;
  try {
    const [dimensionStage, orthogonalityStage, xStage, contributionStage] =
      await Promise.all([
        callStage<DimensionStage>({
          stage: "1_dimension_extraction",
          task: "Extract only the deep motivational dimensions shared or contrasted by the input branches/comments. Do not produce X.",
          outputSchema: {
            dimensions: ["dimension"],
            diversity_warning: null,
            refusal_reason: null,
          },
        }),
        callStage<OrthogonalityStage>({
          stage: "2_orthogonality_detection",
          task: "Detect only productive tensions or orthogonal pairs among the input branches/comments. Do not produce X.",
          outputSchema: {
            orthogonal_pairs: [
              { a: "branch id", b: "branch id", shared_dimension: "dimension" },
            ],
            diversity_warning: null,
            refusal_reason: null,
          },
        }),
        callStage<XStage>({
          stage: "3_x_generation",
          task: "Generate only the N+1 sentence X from the original branches/comments. Refuse honestly if no real synthesis is possible.",
          outputSchema: {
            synthesis_possible: true,
            X: "one sentence synthesis result",
            diversity_warning: null,
            refusal_reason: null,
          },
        }),
        callStage<ContributionStage>({
          stage: "4_contribution_tracking",
          task: "Track which input branch ids contribute to core synthesis elements, using only the original branches/comments. Do not use any previous stage output.",
          outputSchema: {
            valid: true,
            contribution: {
              "synthesis element": ["branch id"],
            },
            diversity_warning: null,
            refusal_reason: null,
          },
        }),
      ]);

    if (!dimensionStage || !orthogonalityStage || !xStage || !contributionStage) {
      result = null;
    } else {
      const contributionInvalid = contributionStage.valid === false;
      const synthesisPossible =
        xStage.synthesis_possible === true && !contributionInvalid;

      result = {
        synthesis_possible: synthesisPossible,
        X: synthesisPossible ? xStage.X : "",
        dimensions: dimensionStage.dimensions ?? [],
        orthogonal_pairs: orthogonalityStage.orthogonal_pairs ?? [],
        contribution: contributionStage.contribution ?? {},
        diversity_warning: joinWarnings([
          dimensionStage.diversity_warning,
          orthogonalityStage.diversity_warning,
          xStage.diversity_warning,
          contributionStage.diversity_warning,
        ]),
        refusal_reason: synthesisPossible
          ? null
          : (xStage.refusal_reason ??
            contributionStage.refusal_reason ??
            dimensionStage.refusal_reason ??
            orthogonalityStage.refusal_reason ??
            "이 입력만으로는 N+1 합성을 만들 수 없습니다."),
      };
    }
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
