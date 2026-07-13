import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type {
  CombinationCandidate,
  PipelineDimension,
  PipelineSynthesis,
} from "@/lib/types";
import type { BranchInput } from "@/lib/synthesis-engine";

const DRAFT_MODEL =
  process.env.SYNTHESIS_DRAFT_MODEL ?? "claude-haiku-4-5-20251001";
const HIGH_MODEL = process.env.SYNTHESIS_HIGH_MODEL ?? "claude-opus-4-8";

const PIPELINE_SYSTEM_PROMPT = `당신은 여러 사람의 직감을 N+1 아이디어로 발전시키는 Synthesis 엔진이다.
입력 가지(branch)는 직감이고 잔가지(comment)는 맥락, 이견, 보강이다.
표면 단어보다 진짜 동기와 관심사를 분석하고, 단순 선택·평균·이어붙이기를 피한다.
생산적 반대가 없거나 근거가 부족하면 억지 결과를 만들지 않는다.
이번 요청에 명시된 한 단계만 수행하며 다른 단계의 결과를 미리 생성하지 않는다.
가장 마지막에 제시된 출력 스키마를 정확히 따르고 JSON 객체 외 텍스트를 출력하지 않는다.`;

type DimensionResponse = {
  dimensions: Array<
    | string
    | {
        label?: string;
        description?: string;
        branch_ids?: string[];
      }
  >;
  diversity_warning?: string | null;
};

type CombinationResponse = {
  candidates: Array<{
    branch_ids: string[];
    shared_dimension: string;
    tension: string;
    rationale: string;
  }>;
  refusal_reason?: string | null;
};

type SynthesisResponse = {
  synthesis_possible: boolean;
  X: string;
  contribution: Record<string, string[]>;
  refusal_reason?: string | null;
};

function extractText(message: Anthropic.Message) {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function parseJson<T>(raw: string): T | null {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    return JSON.parse(clean.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function callJson<T>(
  anthropic: Anthropic,
  model: string,
  instructions: string,
  payload: unknown,
  options: {
    schema?: Anthropic.Messages.JSONOutputFormat["schema"];
    maxTokens?: number;
  } = {},
) {
  const system = `${PIPELINE_SYSTEM_PROMPT}\n\n${instructions}`;
  const stage = instructions.match(/^\[([^\]]+)\]/)?.[1] ?? "unknown";
  async function call(attempt: number) {
    const maxTokens = Math.min(
      (options.maxTokens ?? 1400) * 2 ** (attempt - 1),
      8192,
    );
    console.info("[synthesis-pipeline] model call started", {
      stage,
      model,
      attempt,
      maxTokens,
    });
    try {
      const message = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: JSON.stringify(payload) }],
        output_config: options.schema
          ? { format: { type: "json_schema", schema: options.schema } }
          : undefined,
      });
      const raw = extractText(message);
      const parsed = parseJson<T>(raw);
      console.info("[synthesis-pipeline] model call completed", {
        stage,
        model,
        attempt,
        maxTokens,
        stopReason: message.stop_reason,
        outputTokens: message.usage.output_tokens,
        responseChars: raw.length,
        parsed: parsed !== null,
      });
      return parsed;
    } catch (cause) {
      console.error("[synthesis-pipeline] model call failed", {
        stage,
        model,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }
  }
  return (await call(1)) ?? (await call(2));
}

// 단계 구현
export async function extractDimensions({
  anthropic,
  branches,
}: {
  anthropic: Anthropic;
  branches: BranchInput[];
}) {
  // UUID를 그대로 반복 출력하면 가지가 많을 때 JSON만으로 출력 토큰을
  // 소진한다. 모델에는 짧은 별칭을 주고 응답을 받은 뒤 원래 ID로 복원한다.
  const compactIdByOriginal = new Map(
    branches.map((branch, index) => [branch.id, `b${index + 1}`]),
  );
  const originalIdByCompact = new Map(
    [...compactIdByOriginal].map(([originalId, compactId]) => [
      compactId,
      originalId,
    ]),
  );
  const compactBranches = branches.map((branch) => ({
    ...branch,
    id: compactIdByOriginal.get(branch.id)!,
  }));
  const response = await callJson<DimensionResponse>(
    anthropic,
    DRAFT_MODEL,
    `[1단계] 표면 단어가 아니라 동기 차원을 2~8개 추출한다.
각 차원은 label, description, 관련 branch_ids를 포함한다.
branch_ids에는 입력에 표시된 b1, b2 형식의 짧은 ID만 사용한다.
설명은 차원당 200자 이내로 간결하게 쓴다.`,
    { branches: compactBranches },
    {
      maxTokens: 2400,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["dimensions", "diversity_warning"],
        properties: {
          dimensions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "description", "branch_ids"],
              properties: {
                label: { type: "string" },
                description: { type: "string" },
                branch_ids: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
          },
          diversity_warning: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
        },
      },
    },
  );
  if (!response) throw new Error("차원 추출 결과를 해석하지 못했습니다.");
  const allowedIds = new Set(branches.map((branch) => branch.id));
  const dimensions: PipelineDimension[] = (response.dimensions ?? [])
    .slice(0, 8)
    .flatMap((dimension, index) => {
      const label =
        typeof dimension === "string"
          ? dimension.trim()
          : dimension.label?.trim() ?? "";
      if (!label) return [];

      const branchIds =
        typeof dimension === "string"
          ? branches.map((branch) => branch.id)
          : [...new Set(dimension.branch_ids ?? [])].flatMap((id) => {
              const originalId = originalIdByCompact.get(id) ?? id;
              return allowedIds.has(originalId) ? [originalId] : [];
            });

      return [
        {
          id: `dimension-${index + 1}`,
          label,
          description:
            typeof dimension === "string"
              ? "선택한 가지에서 추출된 공통 동기 차원"
              : dimension.description?.trim() ?? "",
          branch_ids: branchIds,
        },
      ];
    });
  if (dimensions.length === 0) throw new Error("유효한 차원을 찾지 못했습니다.");
  return {
    dimensions,
    diversity_warning: response.diversity_warning ?? null,
    model: DRAFT_MODEL,
  };
}

export async function generateCombinations({
  anthropic,
  branches,
  dimensions,
}: {
  anthropic: Anthropic;
  branches: BranchInput[];
  dimensions: PipelineDimension[];
}) {
  const response = await callJson<CombinationResponse>(
    anthropic,
    DRAFT_MODEL,
    `[2단계] 유지한 차원만 근거로 생산적 반대 조합을 만든다.
후보는 2~4개 branch_ids로 구성하고 중복 없이 최대 8개만 반환한다.
shared_dimension, tension, rationale를 포함한다.
출력: {"candidates":[{"branch_ids":[""],"shared_dimension":"","tension":"","rationale":""}],"refusal_reason":null}`,
    { branches, kept_dimensions: dimensions },
  );
  if (!response) throw new Error("조합 후보 결과를 해석하지 못했습니다.");
  const allowedIds = new Set(branches.map((branch) => branch.id));
  const seen = new Set<string>();
  const candidates: CombinationCandidate[] = [];
  for (const candidate of response.candidates ?? []) {
    const branchIds = [...new Set(candidate.branch_ids ?? [])]
      .filter((id) => allowedIds.has(id))
      .slice(0, 4)
      .sort();
    const signature = branchIds.join(":");
    if (branchIds.length < 2 || seen.has(signature)) continue;
    seen.add(signature);
    candidates.push({
      id: `combination-${candidates.length + 1}`,
      branch_ids: branchIds,
      shared_dimension: candidate.shared_dimension?.trim() ?? "",
      tension: candidate.tension?.trim() ?? "",
      rationale: candidate.rationale?.trim() ?? "",
    });
    if (candidates.length === 8) break;
  }
  return {
    candidates,
    refusal_reason: candidates.length
      ? null
      : response.refusal_reason ?? "생산적 반대 조합을 찾지 못했습니다.",
    model: DRAFT_MODEL,
  };
}

async function synthesizeOne({
  anthropic,
  branches,
  dimensions,
  combination,
  model,
  modelTier,
  previousX,
}: {
  anthropic: Anthropic;
  branches: BranchInput[];
  dimensions: PipelineDimension[];
  combination: CombinationCandidate;
  model: string;
  modelTier: "draft" | "high";
  previousX?: string;
}) {
  const selectedBranches = branches.filter((branch) =>
    combination.branch_ids.includes(branch.id),
  );
  const quality =
    modelTier === "high"
      ? "기존 초안을 다듬는 데 그치지 말고 더 구체적이고 놀라운 제3의 위치를 다시 찾는다."
      : "저비용 초안이지만 입력을 병렬로 이어붙이거나 평균화하지 않는다.";
  const response = await callJson<SynthesisResponse>(
    anthropic,
    model,
    `[3단계] ${quality}
선택 조합과 차원으로 30단어 이내의 구체적인 N+1 한 문장을 만든다.
핵심 요소를 branch id에 contribution으로 매핑한다. 불가능하면 정직하게 거부한다.
출력: {"synthesis_possible":true,"X":"","contribution":{"요소":["branch id"]},"refusal_reason":null}`,
    {
      branches: selectedBranches,
      kept_dimensions: dimensions,
      combination,
      previous_draft: previousX ?? null,
    },
  );
  if (!response) throw new Error("합성 결과를 해석하지 못했습니다.");
  return {
    id: `${combination.id}-${modelTier}-${crypto.randomUUID()}`,
    combination_id: combination.id,
    branch_ids: combination.branch_ids,
    synthesis_possible: response.synthesis_possible === true,
    X: response.X?.trim() ?? "",
    contribution: response.contribution ?? {},
    refusal_reason: response.refusal_reason ?? null,
    model_tier: modelTier,
  } satisfies PipelineSynthesis;
}

export async function synthesizeDrafts({
  anthropic,
  branches,
  dimensions,
  combinations,
}: {
  anthropic: Anthropic;
  branches: BranchInput[];
  dimensions: PipelineDimension[];
  combinations: CombinationCandidate[];
}) {
  const results = await Promise.all(
    combinations.slice(0, 6).map((combination) =>
      synthesizeOne({
        anthropic,
        branches,
        dimensions,
        combination,
        model: DRAFT_MODEL,
        modelTier: "draft",
      }),
    ),
  );
  return { results, model: DRAFT_MODEL };
}

export async function upgradeSynthesis({
  anthropic,
  branches,
  dimensions,
  combination,
  previousX,
}: {
  anthropic: Anthropic;
  branches: BranchInput[];
  dimensions: PipelineDimension[];
  combination: CombinationCandidate;
  previousX: string;
}) {
  const result = await synthesizeOne({
    anthropic,
    branches,
    dimensions,
    combination,
    model: HIGH_MODEL,
    modelTier: "high",
    previousX,
  });
  return { result, model: HIGH_MODEL };
}
