import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type {
  Branch,
  FinalProblemDefinition,
  ProblemEvidence,
  ProblemNode,
  ProblemSession,
} from "@/lib/types";

const MODEL = process.env.SYNTHESIS_DRAFT_MODEL ?? "claude-haiku-4-5-20251001";
const RESEARCH_MODEL =
  process.env.SYNTHESIS_RESEARCH_MODEL ?? "claude-sonnet-4-6";

export type NodeCandidate = {
  label: string;
  statement: string;
  why_question: string;
  rationale: string;
};

type NodeResponse = {
  axis: string;
  candidates: NodeCandidate[];
  mece_check: string;
};

type ResearchResponse = {
  evidence: Array<{
    role: "diverge" | "support" | "challenge";
    title: string;
    publisher: string;
    source_url: string;
    finding: string;
    data_date: string;
  }>;
};

function textFrom(message: Anthropic.Message) {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function parseJson<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function callJson<T>(
  anthropic: Anthropic,
  system: string,
  payload: unknown,
  maxTokens = 2400,
) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });
  const parsed = parseJson<T>(textFrom(response));
  if (!parsed) throw new Error("AI 응답을 구조화된 결과로 해석하지 못했습니다.");
  return parsed;
}

function sessionContext(session: ProblemSession, branches: Branch[]) {
  return {
    topic: session.topic,
    problem_statement_parts: {
      subject: session.subject,
      situation: session.situation,
      surface_problem: session.surface_problem,
      impact: session.impact,
    },
    team_raw_material: branches.map((branch) => ({
      idea: branch.idea,
      context: branch.comments.map((comment) => comment.body),
    })),
  };
}

export async function generateMeceCandidates({
  anthropic,
  session,
  branches,
}: {
  anthropic: Anthropic;
  session: ProblemSession;
  branches: Branch[];
}) {
  const result = await callJson<NodeResponse>(
    anthropic,
    `당신은 대면 문제정의 세션의 구조화 보조자다. 판단은 인간이 한다.
표면 문제와 팀의 날것 생각을 하나의 명시적 축으로 3~5개 MECE 가지로 분해한다.
해결책, 시장조사, 실행 아이디어를 제안하지 않는다. 문제·원인 가설만 쓴다.
각 가지는 서로 겹치지 않고 전체 문제 공간을 빠짐없이 훑어야 한다.
각 후보에는 인간이 다음 깊이에서 답할 구체적인 왜 질문을 붙인다.
JSON만 출력한다: {"axis":"분해 축","candidates":[{"label":"짧은 이름","statement":"관찰·원인 가설","why_question":"왜 질문","rationale":"이 가지가 독립적인 이유"}],"mece_check":"겹침과 빠짐 점검"}`,
    sessionContext(session, branches),
  );
  return {
    axis: result.axis?.trim() || "원인 계열별",
    meceCheck: result.mece_check?.trim() || "",
    candidates: (result.candidates ?? [])
      .filter((item) => item.label?.trim() && item.statement?.trim())
      .slice(0, 5),
  };
}

export async function expandProblemNode({
  anthropic,
  session,
  parent,
  siblings,
  branches,
}: {
  anthropic: Anthropic;
  session: ProblemSession;
  parent: ProblemNode;
  siblings: ProblemNode[];
  branches: Branch[];
}) {
  const result = await callJson<NodeResponse>(
    anthropic,
    `당신은 표면 문제에서 통제 가능한 본질 원인으로 내려가는 5 Whys 보조자다.
사람이 선택한 한 문제 가지를 한 단계 더 깊은 2~4개 MECE 원인 가설로 분해한다.
해결책을 만들지 말고, 입력에 없는 사실을 단정하지 않는다. 모든 후보는 검증 전 가설이다.
형제 가지와 같은 말을 반복하지 않는다. 사람이 직감으로 고를 수 있게 차이를 선명하게 쓴다.
JSON만 출력한다: {"axis":"이번 분해 축","candidates":[{"label":"짧은 이름","statement":"더 깊은 원인 가설","why_question":"다음 왜 질문","rationale":"상위 문제와의 인과 연결"}],"mece_check":"겹침과 빠짐 점검"}`,
    {
      ...sessionContext(session, branches),
      selected_parent: parent,
      existing_siblings: siblings,
    },
  );
  return {
    axis: result.axis?.trim() || parent.axis,
    meceCheck: result.mece_check?.trim() || "",
    candidates: (result.candidates ?? [])
      .filter((item) => item.label?.trim() && item.statement?.trim())
      .slice(0, 4),
  };
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export async function researchProblemNode({
  anthropic,
  session,
  node,
}: {
  anthropic: Anthropic;
  session: ProblemSession;
  node: ProblemNode;
}) {
  const prompt = `다음 문제 가지를 검증하거나 새로운 하위 문제를 발견할 공공데이터·공식 통계를 웹에서 검색하라.
한국 정부·공공기관·국제기구·원 연구기관의 1차 출처를 우선한다.
검색 결과에 실제로 등장한 URL만 source_url에 사용한다. 숫자는 출처가 말한 범위와 시점을 보존한다.
최대 4개를 고르고 역할을 구분한다: diverge=새 문제 가지를 촉발, support=가설 지지, challenge=가설 반증·수정.
JSON만 출력한다: {"evidence":[{"role":"diverge|support|challenge","title":"자료명","publisher":"기관","source_url":"실제 검색 URL","finding":"이 가지에 중요한 수치·사실과 해석 한계","data_date":"자료 기준 시점"}]}

세션: ${JSON.stringify({ topic: session.topic, surface_problem: session.surface_problem, impact: session.impact })}
검증할 가지: ${JSON.stringify({ label: node.label, statement: node.statement })}`;

  const tools: Anthropic.WebSearchTool20250305[] = [
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 4,
      user_location: {
        type: "approximate",
        country: "KR",
        timezone: "Asia/Seoul",
      },
    },
  ];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let response = await anthropic.messages.create({
    model: RESEARCH_MODEL,
    max_tokens: 3200,
    tools,
    messages,
  });
  const responses = [response];
  if (response.stop_reason === "pause_turn") {
    response = await anthropic.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: 3200,
      tools,
      messages: [
        ...messages,
        { role: "assistant", content: response.content },
      ],
    });
    responses.push(response);
  }

  const sourceByUrl = new Map<string, { title: string; url: string }>();
  for (const block of responses.flatMap((item) => item.content)) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result.type !== "web_search_result") continue;
        const key = normalizeUrl(result.url);
        if (key) sourceByUrl.set(key, { title: result.title, url: result.url });
      }
    }
    if (block.type === "text") {
      for (const citation of block.citations ?? []) {
        if (citation.type !== "web_search_result_location") continue;
        const key = normalizeUrl(citation.url);
        if (key) {
          sourceByUrl.set(key, {
            title: citation.title ?? citation.url,
            url: citation.url,
          });
        }
      }
    }
  }

  const parsed = parseJson<ResearchResponse>(textFrom(response));
  if (!parsed) throw new Error("검색 결과를 근거 카드로 해석하지 못했습니다.");
  return (parsed.evidence ?? []).flatMap((item) => {
    const source = sourceByUrl.get(normalizeUrl(item.source_url));
    if (!source || !item.finding?.trim()) return [];
    return [
      {
        role: ["diverge", "support", "challenge"].includes(item.role)
          ? item.role
          : "support",
        title: item.title?.trim() || source.title,
        publisher: item.publisher?.trim() || "공식 출처",
        url: source.url,
        finding: item.finding.trim(),
        data_date: item.data_date?.trim() || "",
      },
    ];
  }).slice(0, 4);
}

export async function createFinalDefinition({
  anthropic,
  session,
  branches,
  selectedNodes,
  selectedEvidence,
  qualityGaps,
}: {
  anthropic: Anthropic;
  session: ProblemSession;
  branches: Branch[];
  selectedNodes: Array<ProblemNode & { vote_count: number }>;
  selectedEvidence: Array<ProblemEvidence & { vote_count: number }>;
  qualityGaps: string[];
}) {
  const result = await callJson<Omit<FinalProblemDefinition, "completed_at">>(
    anthropic,
    `당신은 팀이 이미 내린 인간 판단을 하나의 읽기 쉬운 문제정의 문서로 편집한다.
AI가 새 본질을 선택하지 않는다. vote_count가 있는 선택된 문제 가지와 채택 근거만 사용한다.
문제정의는 [누가][상황][문제][영향]을 한 문장에 포함하고, 해결책·시장조사·실행안을 쓰지 않는다.
근거가 지지하지 않는 단정은 피하고 불확실성은 명시한다. 외부인이 사전 설명 없이 이해할 수 있는 한국어로 쓴다.
quality_gaps가 있으면 문서 생성을 거부하지 말고 confidence를 낮추고 boundaries에 검증 과제로 명시한다.
JSON만 출력한다: {"headline":"12~28자 제목","statement":"완결된 문제정의","root_cause":"팀이 선택한 본질 원인","why_chain":["표면에서 본질까지 단계"],"evidence_summary":["기관·수치·시점이 드러나는 근거 요약"],"newly_discovered":"데이터로 새로 발견하거나 기각한 점","boundaries":["이번 정의가 다루지 않는 범위"],"confidence":"높음|중간|낮음"}`,
    {
      session: sessionContext(session, branches),
      human_selected_problem_nodes: selectedNodes,
      human_selected_evidence: selectedEvidence,
      quality_gaps: qualityGaps,
      boundaries: [
        "시장조사와 솔루션 설계",
        "근거 없는 백지 문제 생성",
        "AI의 인간 직감 대행",
      ],
    },
    3200,
  );
  return {
    headline: result.headline?.trim() || "팀의 본질 문제정의",
    statement: result.statement?.trim() || "",
    root_cause: result.root_cause?.trim() || "",
    why_chain: (result.why_chain ?? []).filter(Boolean).slice(0, 6),
    evidence_summary: (result.evidence_summary ?? []).filter(Boolean).slice(0, 6),
    newly_discovered: result.newly_discovered?.trim() || "",
    boundaries: (result.boundaries ?? []).filter(Boolean).slice(0, 6),
    confidence: ["높음", "중간", "낮음"].includes(result.confidence)
      ? result.confidence
      : "중간",
    completed_at: new Date().toISOString(),
  } satisfies FinalProblemDefinition;
}
