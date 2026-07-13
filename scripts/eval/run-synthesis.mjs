/**
 * Synthesis 엔진 오프라인 평가 러너.
 * 프로덕션과 동일한 lib/synthesis-engine.ts 를 직접 임포트해(Node 24 타입 스트리핑)
 * scripts/eval/cases/*.json 의 테스트 케이스를 배포 없이 실행한다.
 *
 * 사용법:
 *   node scripts/eval/run-synthesis.mjs            # 전체 케이스
 *   node scripts/eval/run-synthesis.mjs 03 07      # 파일명에 해당 문자열이 포함된 케이스만
 * 결과: scripts/eval/results/<case>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SYNTHESIS_SYSTEM_PROMPT } from "../../lib/synthesis-prompt.ts";
import { runSynthesis } from "../../lib/synthesis-engine.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const casesDir = path.join(here, "cases");
const resultsDir = path.join(here, "results");

// .env.local에서 키를 읽는다 (이미 설정된 환경변수는 덮어쓰지 않음).
for (const line of fs
  .readFileSync(path.join(repoRoot, ".env.local"), "utf8")
  .split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY가 없습니다 (.env.local 확인).");
  process.exit(1);
}

const model = process.env.SYNTHESIS_MODEL ?? "claude-sonnet-4-6";
const anthropic = new Anthropic();

async function runCase(file) {
  const testCase = JSON.parse(fs.readFileSync(path.join(casesDir, file), "utf8"));
  const started = Date.now();
  const { result, stageFailures } = await runSynthesis({
    anthropic,
    model,
    systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
    branches: testCase.branches,
  });

  const out = {
    case: testCase,
    model,
    elapsed_ms: Date.now() - started,
    stage_failures: stageFailures,
    result,
  };
  fs.writeFileSync(path.join(resultsDir, file), JSON.stringify(out, null, 2), "utf8");
  console.log(
    `${file}: ${stageFailures.length ? "STAGE_FAIL " + stageFailures.join(",") : result.synthesis_possible ? "SYNTHESIZED" : "REFUSED"} (${out.elapsed_ms}ms)`,
  );
}

// 케이스 3개씩 동시 실행.
async function pool(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

fs.mkdirSync(resultsDir, { recursive: true });
const filters = process.argv.slice(2);
const files = fs
  .readdirSync(casesDir)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => filters.length === 0 || filters.some((s) => f.includes(s)));

console.log(`모델 ${model}, 케이스 ${files.length}개 실행`);
await pool(files, 3, runCase);
console.log("완료 → scripts/eval/results/");
