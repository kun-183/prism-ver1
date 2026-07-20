export type Comment = {
  id: string;
  branch_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type Branch = {
  id: string;
  project_id: string;
  author_id: string;
  idea: string;
  created_at: string;
  comments: Comment[];
};

export type Project = {
  id: string;
  name: string;
  created_at: string;
};

export type ProblemSession = {
  project_id: string;
  topic: string;
  subject: string;
  situation: string;
  surface_problem: string;
  impact: string;
  stage: 1 | 2 | 3 | 4 | 5;
  final_definition: FinalProblemDefinition | null;
  completed_at: string | null;
  updated_at: string;
};

export type ProblemNode = {
  id: string;
  project_id: string;
  parent_id: string | null;
  author_id: string | null;
  source: "ai" | "human";
  depth: number;
  axis: string;
  label: string;
  statement: string;
  why_question: string;
  rationale: string;
  created_at: string;
};

export type ProblemNodeVote = {
  node_id: string;
  author_id: string;
  created_at: string;
};

export type ProblemEvidence = {
  id: string;
  project_id: string;
  node_id: string;
  author_id: string | null;
  source: "web" | "human";
  role: "diverge" | "support" | "challenge";
  title: string;
  publisher: string;
  url: string;
  finding: string;
  data_date: string;
  created_at: string;
};

export type ProblemEvidenceVote = {
  evidence_id: string;
  author_id: string;
  created_at: string;
};

export type ProblemDefinitionSynthesis = {
  synthesis_possible: boolean;
  catalyst: {
    provocation: string;
    reframe: string;
    tensions: string[];
    discussion_question: string;
  } | null;
  contribution: Record<string, string[]>;
  refusal_reason: string | null;
  model: string;
};

export type FinalProblemDefinition = {
  headline: string;
  statement: string;
  root_cause: string;
  why_chain: string[];
  evidence_summary: string[];
  newly_discovered: string;
  boundaries: string[];
  confidence: "높음" | "중간" | "낮음";
  completed_at: string;
  synthesis?: ProblemDefinitionSynthesis | null;
};

export type PipelineDimension = {
  id: string;
  label: string;
  description: string;
  branch_ids: string[];
};

export type CombinationCandidate = {
  id: string;
  branch_ids: string[];
  shared_dimension: string;
  tension: string;
  rationale: string;
};

export type DiscussionCatalyst = {
  /** 팀의 기존 프레임을 깨는 구체적인 N+1 관점. */
  provocation: string;
  /** 이 관점이 입력을 어떻게 새롭게 연결하는지 설명한다. */
  reframe: string;
  /** 성급히 해소하지 않고 다음 논의에 남겨둘 생산적 긴장. */
  tensions: string[];
  /** 팀이 바로 반응할 수 있는 하나의 초점 질문. */
  discussion_question: string;
};

export type MaterialSelection = {
  selected_comment_ids: string[];
  available_comment_count: number;
};

export type PipelineSynthesis = {
  id: string;
  run_id: string | null;
  combination_id: string;
  branch_ids: string[];
  synthesis_possible: boolean;
  /** 이전 저장 데이터와 평가 도구를 위한 대표 문장 호환 필드. */
  X: string;
  catalyst: DiscussionCatalyst | null;
  contribution: Record<string, string[]>;
  material_selection: MaterialSelection;
  refusal_reason: string | null;
  model_tier: "draft" | "high";
};

export type CatalystReaction = "pulled" | "uneasy" | "missing";

// --- 솔루션 도출 단계 (본질 정의 이후) ---
// 발산은 5계열로 고정한다(터널링 방지). 값은 DB check 제약과 일치해야 한다.
export type SolutionCategory =
  | "digital"
  | "environment"
  | "policy"
  | "service"
  | "community";

export const SOLUTION_CATEGORIES: {
  key: SolutionCategory;
  label: string;
  hint: string;
}[] = [
  { key: "digital", label: "디지털 제품", hint: "앱·웹·플랫폼·자동화" },
  { key: "environment", label: "환경·공간 설계", hint: "시설·배치·CPTED·물리 환경" },
  { key: "policy", label: "정책·제도", hint: "규제·인센티브·법·표준" },
  { key: "service", label: "서비스·운영", hint: "프로세스·인력·운영 모델" },
  { key: "community", label: "커뮤니티·행동변화", hint: "캠페인·교육·자조·문화" },
];

export type SolutionCandidate = {
  id: string;
  project_id: string;
  author_id: string | null;
  source: "ai" | "human";
  category: SolutionCategory;
  label: string;
  statement: string;
  essence_link: string;
  tradeoff: string;
  created_at: string;
};

export type SolutionReference = {
  id: string;
  project_id: string;
  candidate_id: string;
  author_id: string | null;
  source: "web" | "human";
  title: string;
  publisher: string;
  url: string;
  finding: string;
  data_date: string;
  created_at: string;
};

// synthesis 버튼 산출 — 기존 DiscussionCatalyst 형식을 그대로 재사용한다.
export type SolutionSynthesis = {
  synthesis_possible: boolean;
  catalyst: DiscussionCatalyst | null;
  contribution: Record<string, string[]>;
  refusal_reason: string | null;
  model: string;
};

export type SolutionSynthesisRun = {
  id: string;
  project_id: string;
  author_id: string | null;
  input_candidate_ids: string[];
  result: SolutionSynthesis;
  created_at: string;
};
