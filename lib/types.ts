export type Comment = {
  id: string;
  branch_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type Branch = {
  id: string;
  author_id: string;
  idea: string;
  created_at: string;
  comments: Comment[];
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
