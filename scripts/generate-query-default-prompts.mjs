import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';

dotenv.config({ path: '.env.local' });

const QUERIES_KEY = 'fnf-shared-queries';
const INSIGHTS_KEY = 'fnf-shared-insights';
const APPLY = process.argv.includes('--apply');

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  throw new Error('Redis 환경 변수가 없습니다.');
}

const redis = new Redis({ url, token });
const dataDir = path.join(process.cwd(), '.local-data');
fs.mkdirSync(dataDir, { recursive: true });

const BRAND_NAMES = {
  M: 'MLB',
  I: 'MLB KIDS',
  X: 'DISCOVERY',
  V: 'DUVETICA',
  ST: 'SERGIO TACCHINI',
};

const BRAND_FOCUS = {
  M: [
    '채널별 성장 대비 이익률(직접이익률/영업이익률) 동행 여부를 우선 점검한다.',
    '대형 채널/체인에서 할인 확대가 이익 훼손으로 이어지는지 확인한다.',
  ],
  I: [
    '사이즈/재고주수 관점에서 저회전 SKU와 할인 의존 SKU를 분리한다.',
    '소량 SKU 과대해석을 피하고 상위 기여 SKU 중심으로 판단한다.',
  ],
  X: [
    '시즌성 품목의 할인-소진 구조와 수익성 균형을 점검한다.',
    '아울렛/오프프라이스 의존이 본채널 이익률에 미치는 영향을 점검한다.',
  ],
  V: [
    '고단가 저물량 구조에서 ASP 방어와 할인 통제 균형을 우선 평가한다.',
    '핵심 SKU/채널 성과가 전체 손익에 미치는 집중도를 확인한다.',
  ],
  ST: [
    '채널 확장 단계에서 매출 성장과 수익성 확보가 동행하는지 확인한다.',
    '프로모션 의존 성장인지 구조적 성장인지 이익률/할인율로 구분한다.',
  ],
};

function timestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function stripBrand(name = '') {
  const p = /^(MLB\s*KIDS|MLB|DISCOVERY|DUVETICA|SERGIO\s*TACCHINI)\s*/i;
  return String(name).replace(p, '').trim().toLowerCase();
}

function normalizeQueryForMatching(query = '') {
  return String(query)
    .replace(/brd_cd\s*=\s*'[A-Z]{1,2}'/gi, "brd_cd='M'")
    .replace(/brd_cd\s+in\s*\(([^)]*)\)/gi, "brd_cd in ('M')")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchPromptFromInsights(queryItem, insights) {
  const queryNameStripped = stripBrand(queryItem.name);

  let match = insights.find((i) => {
    if (!i.title || !i.analysisRequest) return false;
    return stripBrand(i.title) === queryNameStripped;
  });

  if (!match && queryNameStripped.length > 3) {
    match = insights.find((i) => {
      if (!i.title || !i.analysisRequest) return false;
      const t = stripBrand(i.title);
      return t.includes(queryNameStripped) || queryNameStripped.includes(t);
    });
  }

  if (!match) {
    const qn = normalizeQueryForMatching(queryItem.query);
    match = insights.find((i) => i.query && i.analysisRequest && normalizeQueryForMatching(i.query) === qn);
  }

  return match || null;
}

function detectBrandCode(queryItem) {
  const code = String(queryItem.brand || '').toUpperCase();
  if (BRAND_NAMES[code]) return code;

  const upper = `${queryItem.name || ''}\n${queryItem.query || ''}`.toUpperCase();
  if (/(MLB\s*KIDS|MLB\s*KDS|MLB\s*KDIS|\bMK\b|\bBRD_CD\s*=\s*'I')/.test(upper)) return 'I';
  if (/(DISCOVERY|\bDX\b|\bBRD_CD\s*=\s*'X')/.test(upper)) return 'X';
  if (/(DUVETICA|\bDV\b|\bBRD_CD\s*=\s*'V')/.test(upper)) return 'V';
  if (/(SERGIO\s*TACCHINI|\bST\b|\bBRD_CD\s*=\s*'ST')/.test(upper)) return 'ST';
  if (/(^|\s)MLB(\s|$)|\bBRD_CD\s*=\s*'M'/.test(upper)) return 'M';
  return 'M';
}

function inferTopicHints(name = '') {
  const n = String(name).toLowerCase();
  const hints = [];

  if (/할인|d\/c|dc|마크다운/.test(n)) {
    hints.push('할인율 변화가 매출/이익에 미친 영향과 과도 할인 구간을 분리한다.');
  }
  if (/적자|저수익|deficit|loss/.test(n)) {
    hints.push('적자/저수익 대상을 개선 가능 vs 구조적 한계로 구분한다.');
  }
  if (/채널|자사몰|제휴몰|온라인|오프라인|무신사/.test(n)) {
    hints.push('채널별 성장률과 수익성(이익률, 비용률) 동행 여부를 비교한다.');
  }
  if (/매장|shop|store|top/.test(n)) {
    hints.push('상위/하위 매장의 기여도와 이상징후를 우선순위로 정리한다.');
  }
  if (/재고|판매율|재고주수|시즌/.test(n)) {
    hints.push('재고회전, 판매율, 할인의 상호관계를 점검한다.');
  }
  if (/원가|cms|수수료|oprt|profit|이익/.test(n)) {
    hints.push('비용 구조와 수익성 레버를 구체적으로 제시한다.');
  }
  if (hints.length === 0) {
    hints.push('핵심 지표 변화의 원인과 실행 과제를 정량 근거 중심으로 제시한다.');
  }

  return hints.slice(0, 3);
}

function buildPrompt(queryItem) {
  const brandCode = detectBrandCode(queryItem);
  const brandName = BRAND_NAMES[brandCode] || '';
  const region = queryItem.region || 'domestic';
  const topicHints = inferTopicHints(queryItem.name);
  const brandHints = BRAND_FOCUS[brandCode] || [];

  return [
    '당신은 패션 리테일 FP&A 시니어 애널리스트입니다.',
    `분석 주제: ${queryItem.name}`,
    `브랜드: ${brandName} (${brandCode})`,
    `지역: ${region}`,
    '',
    '기간 기준:',
    '- 당월: 2026년 2월(202602), 전년 동월: 2025년 2월(202502)',
    '- 최근 12개월: 202503~202602, 직전 12개월: 202403~202502',
    '',
    '핵심 분석 포인트:',
    ...topicHints.map((x) => `- ${x}`),
    ...brandHints.map((x) => `- ${x}`),
    '- SQL 결과에 있는 수치만 사용하고 과도한 추정은 금지한다.',
    '- 비용 대비 실판매출/수익성 계산은 ACT_SALE_AMT * 1.1 기준.',
    '- 금액은 *_MIL_KRW(백만원) 우선, 필요 시 *_KRW(원) 병기.',
    '',
    '출력 형식:',
    '1) Executive Summary (3~5줄)',
    '2) 핵심 지표 및 변화 요인',
    '3) 리스크/이상징후',
    '4) 실행 과제 (즉시/단기)',
    '5) 데이터 한계 (필요 시)',
    '',
    '분량: A4 1페이지 내외, 한국어 Markdown 보고서',
  ].join('\n');
}

async function main() {
  const [queriesRaw, insightsRaw] = await Promise.all([
    redis.get(QUERIES_KEY),
    redis.get(INSIGHTS_KEY),
  ]);

  const queries = Array.isArray(queriesRaw) ? queriesRaw : [];
  const insights = Array.isArray(insightsRaw) ? insightsRaw.filter((i) => i.analysisRequest && i.analysisRequest.trim()) : [];

  const rows = [];
  const updatedQueries = queries.map((q) => {
    const existing = String(q.analysisRequest || '').trim();
    if (existing) {
      rows.push({ id: q.id, name: q.name, action: 'kept-existing', source: 'query.analysisRequest', len: existing.length });
      return q;
    }

    const matchedInsight = matchPromptFromInsights(q, insights);
    if (matchedInsight?.analysisRequest?.trim()) {
      rows.push({
        id: q.id,
        name: q.name,
        action: 'linked-from-insight',
        source: matchedInsight.id,
        len: matchedInsight.analysisRequest.length,
      });
      return { ...q, analysisRequest: matchedInsight.analysisRequest };
    }

    const generated = buildPrompt(q);
    rows.push({
      id: q.id,
      name: q.name,
      action: 'generated-template',
      source: detectBrandCode(q),
      len: generated.length,
    });
    return { ...q, analysisRequest: generated };
  });

  const summary = {
    totalQueries: queries.length,
    keptExisting: rows.filter((r) => r.action === 'kept-existing').length,
    linkedFromInsight: rows.filter((r) => r.action === 'linked-from-insight').length,
    generatedTemplate: rows.filter((r) => r.action === 'generated-template').length,
    finalCoverage: updatedQueries.filter((q) => String(q.analysisRequest || '').trim()).length,
  };

  const stamp = timestamp();
  const reportPath = path.join(dataDir, `query-prompts-generate-report-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ apply: APPLY, summary, rows: rows.slice(0, 500) }, null, 2),
    'utf8'
  );

  let backupPath = null;
  if (APPLY) {
    backupPath = path.join(dataDir, `saved-queries-backup-prompt-link-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(queries, null, 2), 'utf8');
    await redis.set(QUERIES_KEY, updatedQueries);
  }

  console.log(JSON.stringify({ apply: APPLY, reportPath, backupPath, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
