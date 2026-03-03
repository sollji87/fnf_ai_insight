import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';

dotenv.config({ path: '.env.local' });

const INSIGHTS_KEY = 'fnf-shared-insights';
const APPLY = process.argv.includes('--apply');

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error('Redis 환경 변수가 없습니다.');
  process.exit(1);
}

const redis = new Redis({ url, token });

const dataDir = path.join(process.cwd(), '.local-data');
fs.mkdirSync(dataDir, { recursive: true });

const BRAND_SPECIFIC_FOCUS = {
  M: [
    '채널별 성장 대비 이익률(직접이익률/영업이익률) 동행 여부를 우선 점검한다.',
    '대형 채널/체인에서 할인 확대가 이익 훼손으로 이어지는지 확인한다.',
    '매출 기여 상위 SKU/매장 중심으로 우선순위를 제시한다.',
  ],
  I: [
    '사이즈/재고주수 관점에서 저회전 SKU와 할인 의존 SKU를 분리한다.',
    '시즌 전환 구간의 재고 압력과 할인 상관관계를 점검한다.',
    '소량 SKU 과대해석을 피하고 상위 기여 SKU 중심으로 판단한다.',
  ],
  X: [
    '시즌성 품목의 할인-소진 구조와 수익성 균형을 점검한다.',
    '아울렛/오프프라이스 의존이 본채널 이익률에 미치는 영향을 본다.',
    '시즌 말 마크다운 리스크를 분리해 제시한다.',
  ],
  V: [
    '고단가 저물량 구조에서 ASP 방어와 할인 통제 균형을 우선 평가한다.',
    '소수 핵심 SKU/채널 성과가 전체 손익에 미치는 집중도를 확인한다.',
    '재고 에이징과 시즌 마감 할인 확대 가능성을 리스크로 제시한다.',
  ],
  ST: [
    '채널 확장 단계에서 매출 성장과 수익성 확보가 동행하는지 확인한다.',
    '프로모션 의존 성장인지 구조적 성장인지 이익률/할인율로 구분한다.',
    '확대 가능 채널과 정리 필요 채널을 분리해 실행 과제를 제시한다.',
  ],
};

function timestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function normalizeDates(text) {
  let out = text;
  const replacements = [
    [/\b202601\b/g, '202602'],
    [/\b202501\b/g, '202502'],
    [/2026[.\-/]\s*01/g, '2026.02'],
    [/2025[.\-/]\s*01/g, '2025.02'],
    [/2026년\s*1월/g, '2026년 2월'],
    [/2025년\s*1월/g, '2025년 2월'],
    [/CY\s*\(\s*최근\s*12개월\s*\)\s*:\s*202503\s*[~\-]\s*202602/gi, 'CY(최근 12개월): 202503~202602'],
    [/PY\s*\(\s*직전\s*12개월\s*\)\s*:\s*202403\s*[~\-]\s*202502/gi, 'PY(직전 12개월): 202403~202502'],
    [/202503\s*[~\-]\s*202602/g, '202503~202602'],
    [/202403\s*[~\-]\s*202502/g, '202403~202502'],
  ];

  for (const [from, to] of replacements) {
    out = out.replace(from, to);
  }
  return out;
}

function stripVerboseBoilerplate(text) {
  const dropLinePatterns = [
    /^\s*IMPORTANT OUTPUT RULES\s*$/i,
    /^\s*❗\s*IMPORTANT OUTPUT RULES\s*$/i,
    /^\s*YOU MUST:\s*$/i,
    /^\s*If any rule is violated.*$/i,
    /^\s*JSON,\s*YAML.*$/i,
    /^\s*DO NOT return JSON.*$/i,
    /^\s*DO NOT use sections titled.*$/i,
    /^\s*DO NOT propose strategies.*$/i,
    /^\s*DO NOT speculate beyond.*$/i,
    /^\s*오직 Markdown.*$/i,
    /^\s*Markdown 헤더.*$/i,
    /^\s*한국어로 작성.*$/i,
    /^\s*해석은 제공된 SQL 결과값.*$/i,
    /^\s*데이터 외 추정.*$/i,
  ];

  const lines = text.split('\n');
  const kept = lines.filter((line) => !dropLinePatterns.some((regex) => regex.test(line.trim())));
  return kept.join('\n');
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inferFocus(title, originalText) {
  const text = `${title ?? ''}\n${originalText ?? ''}`;
  if (/적자|저수익|클로징|매장/i.test(text)) {
    return '적자/저수익 매장을 개선 가능 vs 클로징 검토로 분류하고 근거 수치를 제시한다.';
  }
  if (/할인|프로모션|마크다운|할인율/i.test(text)) {
    return '고할인 SKU와 채널별 소진 구조를 분리해 원인과 통제 포인트를 제시한다.';
  }
  if (/채널|자사몰|제휴몰|온라인|오프라인/i.test(text)) {
    return '채널별 매출 성장과 수익성(이익률, 비용률) 동행 여부를 비교한다.';
  }
  if (/재고|시즌|FW|SS|소진/i.test(text)) {
    return '시즌/재고 관점에서 회전, 할인, 수익성 간 트레이드오프를 점검한다.';
  }
  return '핵심 지표 변화와 원인을 정량 근거 중심으로 분석하고 실행 과제를 제시한다.';
}

function detectBrandCode(item, text) {
  const raw = `${item?.brandName ?? ''} ${item?.title ?? ''} ${text ?? ''}`.toUpperCase();
  if (/(MLB\s*KIDS|MLB\s*KDS|MLB\s*KDIS|\bMK\b|\bI\b)/.test(raw)) return 'I';
  if (/(DISCOVERY|\bDX\b|\bX\b)/.test(raw)) return 'X';
  if (/(DUVETICA|\bDV\b|\bV\b)/.test(raw)) return 'V';
  if (/(SERGIO\s*TACCHINI|\bST\b)/.test(raw)) return 'ST';
  if (/(^|\s)MLB(\s|$)|\bM\b/.test(raw)) return 'M';
  return null;
}

function getBrandNameByCode(code) {
  return {
    M: 'MLB',
    I: 'MLB KIDS',
    X: 'DISCOVERY',
    V: 'DUVETICA',
    ST: 'SERGIO TACCHINI',
  }[code];
}

function buildCompactPrompt(item, originalText) {
  const focus = inferFocus(item.title, originalText);
  const brandCode = detectBrandCode(item, originalText);
  const brandName = getBrandNameByCode(brandCode) || item.brandName;
  const brandLine = brandName ? `브랜드: ${brandName}` : '';
  const brandFocus = brandCode ? BRAND_SPECIFIC_FOCUS[brandCode] : null;
  const normalizedTitle = normalizeDates(item.title || '저장 쿼리 분석');

  return normalizeWhitespace([
    '당신은 패션 리테일 FP&A 시니어 애널리스트입니다.',
    `분석 주제: ${normalizedTitle}`,
    brandLine,
    '',
    '기간 기준:',
    '- 당월: 2026년 2월(202602), 전년 동월: 2025년 2월(202502)',
    '- 최근 12개월: 202503~202602, 직전 12개월: 202403~202502',
    '',
    '핵심 분석 포인트:',
    `- ${focus}`,
    '- SQL 결과에 있는 수치만 사용하고 과도한 추정은 금지한다.',
    '- 금액은 *_MIL_KRW(백만원) 우선, 필요 시 *_KRW(원) 병기.',
    '- 비용 대비 실판매출/수익성 계산은 ACT_SALE_AMT * 1.1 기준.',
    ...(brandFocus
      ? [
          '',
          '브랜드 포인트:',
          ...brandFocus.map((line) => `- ${line}`),
        ]
      : []),
    '',
    '출력 형식:',
    '1) Executive Summary (3~5줄)',
    '2) 핵심 지표 및 변화 요인',
    '3) 리스크/이상징후',
    '4) 실행 과제 (즉시/단기)',
    '5) 데이터 한계 (필요 시)',
  ].filter(Boolean).join('\n'));
}

function ensureCorePolicy(item, text) {
  const additions = [];
  const out = normalizeWhitespace(text);

  if (!(/2026년\s*2월|202602/.test(out) && /2025년\s*2월|202502/.test(out))) {
    additions.push('당월은 2026년 2월(202602), 전년 동월은 2025년 2월(202502) 기준.');
  }
  if (!/202503\s*~\s*202602/.test(out)) {
    additions.push('최근 12개월은 202503~202602, 직전 12개월은 202403~202502 기준.');
  }
  if (!/ACT_SALE_AMT\s*\*\s*1\.1/i.test(out)) {
    additions.push('비용 대비 실판매출/수익성 계산은 ACT_SALE_AMT * 1.1 기준.');
  }
  if (!/(_MIL_KRW|백만원)/.test(out)) {
    additions.push('금액 해석은 *_MIL_KRW(백만원) 우선, 필요 시 *_KRW(원) 병기.');
  }
  const brandCode = detectBrandCode(item, out);
  const hasBrandSection = /브랜드 포인트:/.test(out);
  const brandLines = brandCode && !hasBrandSection ? BRAND_SPECIFIC_FOCUS[brandCode] : [];

  const blocks = [out];
  if (additions.length > 0) {
    blocks.push(`공통 기준:\n${additions.map((line) => `- ${line}`).join('\n')}`);
  }
  if (brandLines.length > 0) {
    blocks.push(`브랜드 포인트:\n${brandLines.map((line) => `- ${line}`).join('\n')}`);
  }
  return normalizeWhitespace(blocks.join('\n\n'));
}

function hasOldDatePattern(text) {
  return /(2026년\s*1월|2025년\s*1월|202601|202501|2026[.\-/]\s*01|2025[.\-/]\s*01|202502\s*~\s*202601|202402\s*~\s*202501)/.test(text);
}

function hasVatRule(text) {
  return /ACT_SALE_AMT\s*\*\s*1\.1/i.test(text);
}

function hasMilRule(text) {
  return /(_MIL_KRW|백만원)/.test(text);
}

function hasBrandSpecificRule(text) {
  return /브랜드 포인트:/.test(text);
}

function normalizeAnalysisRequest(item) {
  const raw = String(item.analysisRequest ?? '').trim();
  if (!raw) {
    return { text: raw, rewritten: false, changed: false };
  }

  let next = raw
    .replace(/\[DATA_START\][\s\S]*?\[DATA_END\]/gi, '')
    .replace(/<DATA>[\s\S]*?<\/DATA>/gi, '')
    .replace(/<데이터>[\s\S]*?<\/데이터>/gi, '');

  next = normalizeDates(next);
  next = stripVerboseBoilerplate(next);
  next = normalizeWhitespace(next);

  const shouldRewrite = next.length > 1200 || /STEP\s*1|STEP\s*2|IMPORTANT OUTPUT RULES/i.test(raw);
  if (shouldRewrite) {
    next = buildCompactPrompt(item, raw);
  } else {
    next = ensureCorePolicy(item, next);
  }

  next = normalizeWhitespace(next);
  return {
    text: next,
    rewritten: shouldRewrite,
    changed: next !== raw,
  };
}

function aggregateStats(items, field) {
  const prompts = items
    .map((item) => String(item[field] ?? '').trim())
    .filter(Boolean);

  const lengths = prompts.map((p) => p.length);
  const avgLen = lengths.length > 0
    ? Math.round(lengths.reduce((acc, n) => acc + n, 0) / lengths.length)
    : 0;

  return {
    count: prompts.length,
    avgLen,
    maxLen: lengths.length > 0 ? Math.max(...lengths) : 0,
    oldDatePatternCount: prompts.filter(hasOldDatePattern).length,
    missingVatRuleCount: prompts.filter((p) => !hasVatRule(p)).length,
    missingMilRuleCount: prompts.filter((p) => !hasMilRule(p)).length,
    missingBrandRuleCount: prompts.filter((p) => !hasBrandSpecificRule(p)).length,
    over1200Count: prompts.filter((p) => p.length > 1200).length,
  };
}

async function main() {
  const insights = (await redis.get(INSIGHTS_KEY)) || [];
  if (!Array.isArray(insights)) {
    throw new Error(`${INSIGHTS_KEY} 값이 배열 형식이 아닙니다.`);
  }

  const beforeStats = aggregateStats(insights, 'analysisRequest');

  const changedRows = [];
  const updatedInsights = insights.map((item) => {
    const before = String(item.analysisRequest ?? '').trim();
    const result = normalizeAnalysisRequest(item);
    const after = result.text;

    if (result.changed) {
      changedRows.push({
        id: item.id,
        title: item.title,
        brandName: item.brandName || '',
        beforeLen: before.length,
        afterLen: after.length,
        rewritten: result.rewritten,
      });
      return { ...item, analysisRequest: after };
    }

    return item;
  });

  const afterStats = aggregateStats(updatedInsights, 'analysisRequest');
  const stamp = timestamp();
  const reportPath = path.join(dataDir, `saved-prompts-audit-report-${stamp}.json`);
  const report = {
    key: INSIGHTS_KEY,
    dryRun: !APPLY,
    totalInsights: insights.length,
    changedCount: changedRows.length,
    rewrittenCount: changedRows.filter((row) => row.rewritten).length,
    before: beforeStats,
    after: afterStats,
    sampleChanges: changedRows.slice(0, 50),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  let backupPath = null;
  if (APPLY && changedRows.length > 0) {
    backupPath = path.join(dataDir, `saved-insights-backup-prompts-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(insights, null, 2), 'utf8');
    await redis.set(INSIGHTS_KEY, updatedInsights);
  }

  console.log(JSON.stringify({
    applied: APPLY,
    totalInsights: insights.length,
    changedCount: changedRows.length,
    rewrittenCount: changedRows.filter((row) => row.rewritten).length,
    reportPath,
    backupPath,
    before: beforeStats,
    after: afterStats,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
