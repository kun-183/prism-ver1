import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type {
  FinalProblemDefinition,
  ProblemEvidence,
  SolutionCandidate,
  SolutionCategory,
} from "@/lib/types";
import { SOLUTION_CATEGORIES } from "@/lib/types";

const DRAFT_MODEL =
  process.env.SYNTHESIS_DRAFT_MODEL ?? "claude-haiku-4-5-20251001";
const RESEARCH_MODEL =
  process.env.SYNTHESIS_RESEARCH_MODEL ?? "claude-sonnet-4-6";

type CandidateResponse = {
  candidates: Array<{
    category: SolutionCategory;
    label: string;
    statement: string;
    essence_link: string;
    tradeoff: string;
  }>;
};

type ReferenceResponse = {
  references: Array<{
    candidate_id: string;
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

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export async function generateSolutionCandidates({
  anthropic,
  definition,
  evidence,
}: {
  anthropic: Anthropic;
  definition: FinalProblemDefinition;
  evidence: ProblemEvidence[];
}) {
  const response = await anthropic.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 3200,
    system: `당신은 문제정의 이후 솔루션 발산을 돕는 구조화 보조자다. 최종 선택은 인간이 한다.
동일한 앱·웹 아이디어를 말만 바꾸지 말고, 지정된 5계열마다 정확히 1개의 서로 다른 후보를 만든다.
후보는 실행계획이나 사업성 평가가 아니라 탐색 가능한 솔루션 개념이어야 한다.
essence_link에는 입력된 본질 문제·근거 중 무엇을 어떤 작동 원리로 바꾸는지 명시한다.
tradeoff에는 이 후보를 택할 때 감수해야 할 핵심 긴장 하나를 한 줄로 쓴다.
입력에 없는 사실이나 성과 수치를 발명하지 않는다.
JSON만 출력한다: {"candidates":[{"category":"digital|environment|policy|service|community","label":"짧은 후보명","statement":"구체적인 솔루션 개념","essence_link":"본질 문제와의 연결","tradeoff":"핵심 트레이드오프"}]}`,
    messages: [{
      role: "user",
      content: JSON.stringify({
        final_problem_definition: definition,
        adopted_evidence: evidence.map((item) => ({
          id: item.id,
          role: item.role,
          title: item.title,
          publisher: item.publisher,
          finding: item.finding,
          data_date: item.data_date,
        })),
        required_categories: SOLUTION_CATEGORIES,
      }),
    }],
  });
  const parsed = parseJson<CandidateResponse>(textFrom(response));
  if (!parsed) throw new Error("솔루션 후보를 구조화된 결과로 해석하지 못했습니다.");

  const allowed = new Set<SolutionCategory>(SOLUTION_CATEGORIES.map((item) => item.key));
  const seen = new Set<SolutionCategory>();
  const candidates = (parsed.candidates ?? []).flatMap((candidate) => {
    if (
      !allowed.has(candidate.category) ||
      seen.has(candidate.category) ||
      !candidate.label?.trim() ||
      !candidate.statement?.trim() ||
      !candidate.essence_link?.trim() ||
      !candidate.tradeoff?.trim()
    ) return [];
    seen.add(candidate.category);
    return [{
      category: candidate.category,
      label: candidate.label.trim(),
      statement: candidate.statement.trim(),
      essence_link: candidate.essence_link.trim(),
      tradeoff: candidate.tradeoff.trim(),
    }];
  });
  const missing = SOLUTION_CATEGORIES.filter((item) => !seen.has(item.key));
  if (missing.length > 0) {
    throw new Error(`5계열 중 ${missing.map((item) => item.label).join(", ")} 후보가 누락되었습니다.`);
  }
  return { candidates, model: DRAFT_MODEL };
}

export async function researchSolutionReferences({
  anthropic,
  definition,
  candidates,
}: {
  anthropic: Anthropic;
  definition: FinalProblemDefinition;
  candidates: SolutionCandidate[];
}) {
  const tools: Anthropic.WebSearchTool20250305[] = [{
    type: "web_search_20250305",
    name: "web_search",
    max_uses: Math.min(10, Math.max(3, candidates.length * 2)),
    user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" },
  }];
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `다음 본질 문제와 솔루션 후보를 검토하고, 각 후보의 작동 원리를 구체화하거나 검증할 실제 선례를 웹에서 검색하라.
후보마다 가능하면 1개 이상을 찾되, 억지로 유사 사례를 붙이지 않는다. 정부·공공기관·국제기구·원 연구기관·실제 운영 주체의 1차 출처를 우선한다.
검색 결과에 실제로 등장한 URL만 source_url에 사용하고, finding에는 선례가 한 일과 이 후보에 주는 구체적 시사점 및 한계를 쓴다.
candidate_id는 입력값을 정확히 보존한다. JSON만 출력한다:
{"references":[{"candidate_id":"uuid","title":"자료·사례명","publisher":"기관","source_url":"실제 검색 URL","finding":"작동 방식·시사점·한계","data_date":"자료 기준 시점"}]}

본질 문제: ${JSON.stringify({ statement: definition.statement, root_cause: definition.root_cause, evidence: definition.evidence_summary })}
후보: ${JSON.stringify(candidates.map((item) => ({ id: item.id, category: item.category, label: item.label, statement: item.statement, essence_link: item.essence_link, tradeoff: item.tradeoff })))}`,
  }];
  let response = await anthropic.messages.create({
    model: RESEARCH_MODEL,
    max_tokens: 4200,
    tools,
    messages,
  });
  const responses = [response];
  if (response.stop_reason === "pause_turn") {
    response = await anthropic.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: 4200,
      tools,
      messages: [...messages, { role: "assistant", content: response.content }],
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
        if (key) sourceByUrl.set(key, { title: citation.title ?? citation.url, url: citation.url });
      }
    }
  }

  const parsed = parseJson<ReferenceResponse>(textFrom(response));
  if (!parsed) throw new Error("검색 결과를 솔루션 선례로 해석하지 못했습니다.");
  const candidateIds = new Set(candidates.map((item) => item.id));
  const signatures = new Set<string>();
  return (parsed.references ?? []).flatMap((item) => {
    const source = sourceByUrl.get(normalizeUrl(item.source_url));
    const signature = `${item.candidate_id}:${normalizeUrl(item.source_url)}`;
    if (
      !candidateIds.has(item.candidate_id) ||
      !source ||
      !item.finding?.trim() ||
      signatures.has(signature)
    ) return [];
    signatures.add(signature);
    return [{
      candidate_id: item.candidate_id,
      title: item.title?.trim() || source.title,
      publisher: item.publisher?.trim() || "공식 출처",
      url: source.url,
      finding: item.finding.trim(),
      data_date: item.data_date?.trim() || "",
    }];
  }).slice(0, candidates.length * 2);
}
