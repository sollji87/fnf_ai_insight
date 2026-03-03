import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';

dotenv.config({ path: '.env.local' });

const QUERIES_KEY = 'fnf-shared-queries';
const INSIGHTS_KEY = 'fnf-shared-insights';
const dataDir = path.join(process.cwd(), '.local-data');
fs.mkdirSync(dataDir, { recursive: true });

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error('Redis 환경 변수가 없습니다.');
}

const redis = new Redis({ url, token });

const BRAND_NAME_BY_CODE = {
  M: 'MLB',
  I: 'MLB KIDS',
  X: 'DISCOVERY',
  V: 'DUVETICA',
  ST: 'SERGIO TACCHINI',
};

const BRAND_NAMES_PATTERN = /^(MLB\s*KIDS|MLB|DISCOVERY|DUVETICA|SERGIO\s*TACCHINI)\s*/i;

function ts() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function stripBrand(name = '') {
  return String(name).replace(BRAND_NAMES_PATTERN, '').trim().toLowerCase();
}

function normalizeQueryForMatching(query = '') {
  return String(query)
    .replace(/brd_cd\s*=\s*'[A-Z]{1,2}'/gi, "brd_cd='M'")
    .replace(/brd_cd\s+in\s*\(([^)]*)\)/gi, "brd_cd in ('M')")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function detectQueryBrandName(query) {
  const code = String(query?.brand || '').toUpperCase();
  if (BRAND_NAME_BY_CODE[code]) return BRAND_NAME_BY_CODE[code];
  return '';
}

function matchPromptToQuery(queryItem, insights) {
  const queryNameStripped = stripBrand(queryItem.name);

  // 1) exact title match after removing brand prefix
  let match = insights.find((i) => {
    if (!i.title || !i.analysisRequest) return false;
    const titleStripped = stripBrand(i.title);
    return titleStripped === queryNameStripped;
  });

  // 2) partial title contains
  if (!match && queryNameStripped.length > 3) {
    match = insights.find((i) => {
      if (!i.title || !i.analysisRequest) return false;
      const titleStripped = stripBrand(i.title);
      return titleStripped.includes(queryNameStripped) || queryNameStripped.includes(titleStripped);
    });
  }

  // 3) SQL normalized match
  if (!match) {
    const queryNorm = normalizeQueryForMatching(queryItem.query);
    match = insights.find((i) => {
      if (!i.query || !i.analysisRequest) return false;
      return normalizeQueryForMatching(i.query) === queryNorm;
    });
  }

  return match || null;
}

function evaluatePrompt(prompt, queryBrandName = '') {
  const text = String(prompt || '').trim();
  const issues = [];
  let score = 0;

  if (!text) {
    return {
      score: 0,
      grade: 'FAIL',
      a4Ready: false,
      issues: ['프롬프트가 비어 있음'],
    };
  }

  const len = text.length;
  if (len >= 250 && len <= 1300) {
    score += 15;
  } else if (len >= 180 && len <= 1600) {
    score += 8;
    issues.push(`길이 경계값(${len}자)`);
  } else {
    issues.push(`길이 부적합(${len}자)`);
  }

  if (/(FP&A|애널리스트|분석가|경영관리)/i.test(text)) {
    score += 10;
  } else {
    issues.push('역할/관점 정의 부족');
  }

  const hasCurrentVsYoY = /(202602|2026년\s*2월).*(202502|2025년\s*2월)|(2025년\s*2월).*(2026년\s*2월)/.test(text);
  const has12m = /(202503\s*~\s*202602).*(202403\s*~\s*202502)|(202403\s*~\s*202502).*(202503\s*~\s*202602)/.test(text);
  if (hasCurrentVsYoY && has12m) {
    score += 20;
  } else if (hasCurrentVsYoY || has12m) {
    score += 10;
    issues.push('기간 기준 일부 누락');
  } else {
    issues.push('기간 기준 누락');
  }

  const hasOutputStructure =
    /(Executive Summary|핵심 요약|출력 형식|1\)\s*Executive Summary|1\)\s*핵심)/i.test(text) &&
    /(리스크|이상징후)/i.test(text) &&
    /(실행 과제|Action Plan|액션)/i.test(text);
  if (hasOutputStructure) {
    score += 20;
  } else {
    issues.push('A4 보고서 구조 지시 약함');
  }

  if (/(SQL 결과|제공된 데이터|수치만 사용|추정 금지|과도한 추정은 금지)/i.test(text)) {
    score += 10;
  } else {
    issues.push('데이터 근거 제약 약함');
  }

  if (/(_MIL_KRW|백만원)/.test(text)) {
    score += 10;
  } else {
    issues.push('단위 규칙 누락');
  }

  if (/ACT_SALE_AMT\s*\*\s*1\.1/i.test(text)) {
    score += 10;
  } else {
    issues.push('부가세(1.1) 규칙 누락');
  }

  if (/(markdown|마크다운|헤더|표)/i.test(text)) {
    score += 5;
  } else {
    issues.push('출력 포맷(마크다운) 지시 약함');
  }

  if (queryBrandName) {
    if (new RegExp(queryBrandName.replace(/\s+/g, '\\s*'), 'i').test(text) || /브랜드 포인트:/i.test(text)) {
      score += 10;
    } else {
      issues.push('브랜드 특화 지시 약함');
    }
  } else {
    score += 10;
  }

  score = Math.min(score, 100);
  const grade = score >= 85 ? 'PASS' : score >= 70 ? 'WARN' : 'FAIL';
  return {
    score,
    grade,
    a4Ready: score >= 80,
    issues,
  };
}

function summarizeByBrand(rows) {
  const map = {};
  for (const r of rows) {
    const b = r.queryBrand || 'UNKNOWN';
    if (!map[b]) {
      map[b] = { total: 0, matched: 0, ready: 0, avgScore: 0, fail: 0, warn: 0, pass: 0 };
    }
    map[b].total += 1;
    if (r.promptMatched) map[b].matched += 1;
    if (r.a4Ready) map[b].ready += 1;
    map[b].avgScore += r.score;
    map[b][r.grade.toLowerCase()] += 1;
  }
  for (const b of Object.keys(map)) {
    map[b].avgScore = Number((map[b].avgScore / map[b].total).toFixed(1));
  }
  return map;
}

async function main() {
  const [queriesRaw, insightsRaw] = await Promise.all([
    redis.get(QUERIES_KEY),
    redis.get(INSIGHTS_KEY),
  ]);

  const queries = Array.isArray(queriesRaw) ? queriesRaw : [];
  const insights = Array.isArray(insightsRaw) ? insightsRaw.filter((i) => i.analysisRequest && i.analysisRequest.trim()) : [];

  const rows = queries.map((q) => {
    const matched = matchPromptToQuery(q, insights);
    const queryLinkedPrompt = String(q.analysisRequest || '').trim();
    const activePrompt = queryLinkedPrompt || matched?.analysisRequest || '';
    const promptSource = queryLinkedPrompt ? 'query.analysisRequest' : (matched ? 'insight.match' : 'none');
    const queryBrand = detectQueryBrandName(q);
    const evalResult = evaluatePrompt(activePrompt, queryBrand);
    return {
      queryId: q.id,
      queryName: q.name,
      queryBrand,
      queryRegion: q.region || '',
      promptMatched: Boolean(activePrompt),
      promptSource,
      matchedInsightId: matched?.id || null,
      matchedInsightTitle: matched?.title || null,
      promptLength: activePrompt.length,
      score: evalResult.score,
      grade: evalResult.grade,
      a4Ready: evalResult.a4Ready,
      issues: evalResult.issues,
    };
  });

  const total = rows.length;
  const matchedCount = rows.filter((r) => r.promptMatched).length;
  const readyCount = rows.filter((r) => r.a4Ready).length;
  const pass = rows.filter((r) => r.grade === 'PASS').length;
  const warn = rows.filter((r) => r.grade === 'WARN').length;
  const fail = rows.filter((r) => r.grade === 'FAIL').length;
  const avgScore = Number((rows.reduce((acc, r) => acc + r.score, 0) / (rows.length || 1)).toFixed(1));
  const matchedRows = rows.filter((r) => r.promptMatched);
  const matchedAvgScore = Number((matchedRows.reduce((acc, r) => acc + r.score, 0) / (matchedRows.length || 1)).toFixed(1));
  const matchedA4Ready = matchedRows.filter((r) => r.a4Ready).length;
  const matchedPass = matchedRows.filter((r) => r.grade === 'PASS').length;
  const matchedWarn = matchedRows.filter((r) => r.grade === 'WARN').length;
  const matchedFail = matchedRows.filter((r) => r.grade === 'FAIL').length;

  const failRows = rows
    .filter((r) => r.grade !== 'PASS')
    .sort((a, b) => a.score - b.score)
    .slice(0, 80);

  const unmatchedRows = rows.filter((r) => !r.promptMatched);

  const issueFreq = {};
  for (const r of rows) {
    for (const i of r.issues) {
      issueFreq[i] = (issueFreq[i] || 0) + 1;
    }
  }
  const topIssues = Object.entries(issueFreq)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const report = {
    generatedAt: new Date().toISOString(),
    keys: { queries: QUERIES_KEY, insights: INSIGHTS_KEY },
    totals: {
      queries: total,
      promptsAvailable: insights.length,
      matchedPrompts: matchedCount,
      unmatchedPrompts: total - matchedCount,
      a4Ready: readyCount,
      a4NotReady: total - readyCount,
      pass,
      warn,
      fail,
      avgScore,
      matchedOnly: {
        total: matchedRows.length,
        a4Ready: matchedA4Ready,
        pass: matchedPass,
        warn: matchedWarn,
        fail: matchedFail,
        avgScore: matchedAvgScore,
      },
    },
    byBrand: summarizeByBrand(rows),
    topIssues,
    unmatchedRows,
    failRows,
    rows,
  };

  const outputPath = path.join(dataDir, `query-prompt-a4-review-${ts()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({
    outputPath,
    totals: report.totals,
    topIssues,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
