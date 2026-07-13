/**
 * Synthesis 합성 엔진 — API 라우트와 평가 러너(scripts/eval)가 공유한다.
 *
 * 단계 구조 (2026-07-08 평가에서 발견된 구조적 결함 수정):
 *   1·2단계(차원 추출, 직교 쌍 탐지)는 원본 입력만 받아 병렬 실행.
 *   직교 쌍이 0개면 코드 레벨에서 즉시 거부 — 프롬프트 규칙("직교 쌍 0이면 거부")을
 *   프롬프트에만 맡기지 않는다.
 *   3단계(X 생성)는 1·2단계 산출물을 입력으로 받는다.
 *   4단계(기여 추적)는 3단계가 실제로 생성한 X를 입력으로 받는다 — X를 못 보면
 *   허구 매핑이 되는 것이 평가로 확인됨.
 *   diversity_warning은 1단계 전담(4단계 경고를 이어붙이면 중복·모순 발생).
 *
 * 의존성 주입(anthropic, systemPrompt)을 받는 이유: 이 파일에 런타임 임포트가 없어야
 * Node의 .ts 타입 스트리핑(러너)과 Next 번들링(라우트) 양쪽에서 그대로 동작한다.
 */
import type Anthropic from "@anthropic-ai/sdk";

export type BranchInput = { id: string; idea: string; comments: string[] };

export type SynthesisResult = {
  synthesis_possible: boolean;
  X: string;
  dimensions: string[];
  orthogonal_pairs: { a: string; b: string; shared_dimension: string }[];
  contribution: Record<string, string[]>;
  diversity_warning: string | null;
  refusal_reason: string | null;
};

export type SynthesisRun = {
  result: SynthesisResult | null;
  /** JSON 파싱이 2회 모두 실패한 단계 이름들. 비어 있지 않으면 result는 null. */
  stageFailures: string[];
};

type DimensionStage = {
  dimensions: string[];
  diversity_warning?: string | null;
  refusal_reason?: string | null;
};

type OrthogonalityStage = {
  orthogonal_pairs: SynthesisResult["orthogonal_pairs"];
  refusal_reason?: string | null;
};

type XStage = {
  synthesis_possible: boolean;
  X: string;
  refusal_reason?: string | null;
};

type ContributionStage = {
  contribution: SynthesisResult["contribution"];
  valid?: boolean;
  refusal_reason?: string | null;
};

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function tryParse<T>(raw: string): T | null {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    return null;
  }
}

export async function runSynthesis({
  anthropic,
  model,
  systemPrompt,
  branches,
}: {
  anthropic: Anthropic;
  model: string;
  systemPrompt: string;
  branches: BranchInput[];
}): Promise<SynthesisRun> {
  async function callModel(userContent: string, stageSystem: string) {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: stageSystem,
          cache_control: { type: "ephemeral" }, // 긴 시스템 프롬프트 캐싱
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });
    return extractText(msg);
  }

  async function callStage<T>({
    stage,
    stageInstructions,
    payload,
    outputSchema,
  }: {
    stage: string;
    stageInstructions: string;
    payload: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  }): Promise<T | null> {
    const stageSystem = `${systemPrompt}

${stageInstructions}
반드시 아래 output_schema와 같은 JSON 객체만 출력한다.
${JSON.stringify(outputSchema)}`;

    const content = JSON.stringify({ stage, branches, ...payload });
    let r = tryParse<T>(await callModel(content, stageSystem));
    if (!r) r = tryParse<T>(await callModel(content, stageSystem));
    return r;
  }

  function refusal(
    reason: string,
    dim: DimensionStage | null,
    ortho: OrthogonalityStage | null,
  ): SynthesisRun {
    return {
      stageFailures: [],
      result: {
        synthesis_possible: false,
        X: "",
        dimensions: dim?.dimensions ?? [],
        orthogonal_pairs: ortho?.orthogonal_pairs ?? [],
        contribution: {}, // 거부 시 기여 매핑은 무의미 — 항상 비운다
        diversity_warning: dim?.diversity_warning ?? null,
        refusal_reason: reason,
      },
    };
  }

  // 1·2단계: 원본 입력만 받는 독립 호출, 병렬 실행.
  const [dim, ortho] = await Promise.all([
    callStage<DimensionStage>({
      stage: "1_dimension_extraction",
      stageInstructions: `[독립 단계 호출 — 1단계 차원 추출]
이번 호출은 차원 추출만 수행한다. X를 생성하지 마라.
입력 다양성 점검은 이 단계의 전담 책임이다:
- 각 차원에 몰린 직감 수를 실제로 세어라. 어느 한 차원에 입력 직감의 50% 이상이 몰리면 반드시 diversity_warning에 "과집중"과 해당 차원, 몰린 직감 수를 명시하라.
- 추출된 차원 수가 입력 직감 수의 50% 미만이면 diversity_warning에 "다양성 부족"을 명시하라.
- 경고는 한 문장으로 하나만 쓴다. 문제가 없으면 null.`,
      payload: {},
      outputSchema: {
        dimensions: ["dimension"],
        diversity_warning: null,
        refusal_reason: null,
      },
    }),
    callStage<OrthogonalityStage>({
      stage: "2_orthogonality_detection",
      stageInstructions: `[독립 단계 호출 — 2단계 직교 쌍 탐지]
이번 호출은 직교 쌍 탐지만 수행한다. X를 생성하지 마라.
같은 차원의 양극을 차지하는 "생산적 반대" 쌍만 찾아라.
실제로 직교 쌍이 없으면(직감들이 사실상 같은 얘기거나, 공통 차원이 전혀 없으면) 억지로 만들지 말고 빈 배열을 반환하라. 빈 배열은 실패가 아니라 정직한 결과다.`,
      payload: {},
      outputSchema: {
        orthogonal_pairs: [
          { a: "branch id", b: "branch id", shared_dimension: "dimension" },
        ],
        refusal_reason: null,
      },
    }),
  ]);

  if (!dim || !ortho) {
    return {
      result: null,
      stageFailures: [
        ...(!dim ? ["1_dimension_extraction"] : []),
        ...(!ortho ? ["2_orthogonality_detection"] : []),
      ],
    };
  }

  // 코드 가드: 직교 쌍 0 = 합성 자원 없음. 시스템 프롬프트의 거부 규칙을 코드로 강제한다.
  const pairs = ortho.orthogonal_pairs ?? [];
  if (pairs.length === 0) {
    return refusal(
      ortho.refusal_reason ??
        "직감들 사이에 생산적 반대(직교 쌍)가 없어 N+1 합성이 불가능합니다. 서로 다른 관점의 직감이 더 필요합니다.",
      dim,
      ortho,
    );
  }

  // 3단계: 1·2단계 산출물을 근거로 X 생성.
  const x = await callStage<XStage>({
    stage: "3_x_generation",
    stageInstructions: `[의존 단계 호출 — 3단계 X 생성]
이번 호출은 X 생성만 수행한다.
페이로드의 stage1_dimensions(추출된 차원)와 stage2_orthogonal_pairs(직교 쌍)는 앞 단계의 실제 산출물이다. 반드시 이를 근거로 사용하라.
출력 전 자체 점검 — 하나라도 실패하면 그 X를 버리고 재생성한다:
1. X가 입력 직감들을 접속사나 나열("~하되 ~하자", "~하고 ~한다", A+B+C 병렬)로 이어붙인 문장이면 실패다. 합성은 이어붙이기가 아니라 공통 차원 위에서 찾은 제3의 위치다.
2. stage1_dimensions의 주요 차원 각각이 X에 최소 한 번 닿아야 한다. 입력 직감이 많아도(5개 이상) 어느 차원도 조용히 버리지 마라.
3. X와 각 입력 직감의 유사도가 고르면(평균화) 실패다. 어떤 직감과는 강하게, 어떤 직감과는 약하게 닿아야 한다.
4. stage2_orthogonal_pairs의 양쪽 어느 쪽도 부정하지 않고 공통 차원의 제3 위치로 흡수해야 한다.
5회 재생성해도 모든 점검을 통과하는 X가 없으면 synthesis_possible을 false로 하고 이유를 밝혀라.`,
    payload: {
      stage1_dimensions: dim.dimensions ?? [],
      stage2_orthogonal_pairs: pairs,
    },
    outputSchema: {
      synthesis_possible: true,
      X: "one sentence synthesis result",
      refusal_reason: null,
    },
  });

  if (!x) return { result: null, stageFailures: ["3_x_generation"] };

  if (x.synthesis_possible !== true || !x.X) {
    return refusal(
      x.refusal_reason ?? "이 입력만으로는 N+1 합성을 만들 수 없습니다.",
      dim,
      ortho,
    );
  }

  // 4단계: 실제로 생성된 X를 받아 기여를 추적한다.
  const contrib = await callStage<ContributionStage>({
    stage: "4_contribution_tracking",
    stageInstructions: `[의존 단계 호출 — 4단계 기여 추적]
페이로드의 X는 3단계에서 실제로 생성된 최종 문장이다.
X의 실제 문장에 등장하는 핵심 요소(단어/구)만 contribution의 키로 사용하라. X에 없는 요소를 만들어내지 마라.
각 요소가 어느 직감(branch id)에서 왔는지 매핑하라.
어느 직감에도 매핑할 수 없는 추상어가 X의 30%를 넘으면 valid를 false로 하고 이유를 밝혀라.`,
    payload: { X: x.X },
    outputSchema: {
      valid: true,
      contribution: { "X에 실제로 등장하는 요소": ["branch id"] },
      refusal_reason: null,
    },
  });

  if (!contrib) return { result: null, stageFailures: ["4_contribution_tracking"] };

  if (contrib.valid === false) {
    return refusal(
      contrib.refusal_reason ??
        "X의 핵심 요소가 입력 직감에 충분히 근거하지 않아 결과를 신뢰할 수 없습니다.",
      dim,
      ortho,
    );
  }

  return {
    stageFailures: [],
    result: {
      synthesis_possible: true,
      X: x.X,
      dimensions: dim.dimensions ?? [],
      orthogonal_pairs: pairs,
      contribution: contrib.contribution ?? {},
      diversity_warning: dim.diversity_warning ?? null, // 다양성 경고는 1단계 전담
      refusal_reason: null,
    },
  };
}
