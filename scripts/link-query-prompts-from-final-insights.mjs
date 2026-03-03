import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const INSIGHTS_KEY = 'fnf-shared-insights';
const QUERIES_KEY = 'fnf-shared-queries';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  throw new Error('Redis 환경 변수가 없습니다.');
}

const redis = new Redis({ url, token });
const dataDir = path.join(process.cwd(), '.local-data');
fs.mkdirSync(dataDir, { recursive: true });

const BRAND_CODE_BY_NAME = {
  MLB: 'M',
  'MLB KIDS': 'I',
  DISCOVERY: 'X',
  DUVETICA: 'V',
  'SERGIO TACCHINI': 'ST',
};

function timestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function normalizeQuery(query = '') {
  return String(query)
    .replace(/brd_cd\s*=\s*'[A-Z]{1,2}'/gi, "brd_cd='M'")
    .replace(/brd_cd\s+in\s*\(([^)]*)\)/gi, "brd_cd in ('M')")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeTitle(text = '') {
  let out = String(text || '');
  out = out.replace(/_/g, ' ');
  out = out.replace(/^(MLB\s*KIDS|MLB|DISCOVERY|DUVETICA|SERGIO\s*TACCHINI|MK|DX|DV|ST|M|I|X|V)\b[\s\-]*/i, '');
  out = out.replace(/\s*\((MK|DX|DV|ST|M|I|X|V)\)\s*$/i, '');
  out = out.replace(/[^a-zA-Z0-9가-힣 ]/g, ' ');
  out = out.replace(/\s+/g, ' ');
  return out.trim().toLowerCase();
}

function tokenize(text = '') {
  return new Set(
    normalizeTitle(text)
      .split(' ')
      .map((x) => x.trim())
      .filter((x) => x.length >= 2)
  );
}

function jaccard(aSet, bSet) {
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let inter = 0;
  for (const a of aSet) if (bSet.has(a)) inter += 1;
  const union = aSet.size + bSet.size - inter;
  return union > 0 ? inter / union : 0;
}

function detectBrandCodeFromQuery(queryItem) {
  const code = String(queryItem.brand || '').toUpperCase();
  if (['M', 'I', 'X', 'V', 'ST'].includes(code)) return code;

  const upper = `${queryItem.name || ''}\n${queryItem.query || ''}`.toUpperCase();
  if (/(MLB\s*KIDS|MLB\s*KDS|MLB\s*KDIS|\bMK\b|\bBRD_CD\s*=\s*'I')/.test(upper)) return 'I';
  if (/(DISCOVERY|\bDX\b|\bBRD_CD\s*=\s*'X')/.test(upper)) return 'X';
  if (/(DUVETICA|\bDV\b|\bBRD_CD\s*=\s*'V')/.test(upper)) return 'V';
  if (/(SERGIO\s*TACCHINI|\bST\b|\bBRD_CD\s*=\s*'ST')/.test(upper)) return 'ST';
  return 'M';
}

function detectBrandCodeFromInsight(insight) {
  const raw = String(insight.brandName || '').trim().toUpperCase();
  if (raw in BRAND_CODE_BY_NAME) return BRAND_CODE_BY_NAME[raw];
  if (raw.includes('MLB KIDS')) return 'I';
  if (raw.includes('DISCOVERY')) return 'X';
  if (raw.includes('DUVETICA')) return 'V';
  if (raw.includes('SERGIO TACCHINI')) return 'ST';
  if (raw.includes('MLB')) return 'M';
  return null;
}

function pickBrandDefaultPrompt(candidates, brandCode) {
  const brandCandidates = candidates.filter((c) => c.brandCode === brandCode);
  const pool = brandCandidates.length > 0 ? brandCandidates : candidates;
  if (pool.length === 0) return null;

  pool.sort((a, b) => {
    if (b.prompt.length !== a.prompt.length) return b.prompt.length - a.prompt.length;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
  return pool[0];
}

function matchPromptForQuery(queryItem, candidates, queryMap, titleMap) {
  const qNorm = normalizeQuery(queryItem.query || '');
  const tNorm = normalizeTitle(queryItem.name || '');
  const brandCode = detectBrandCodeFromQuery(queryItem);

  if (qNorm && queryMap.has(qNorm)) {
    const matched = queryMap.get(qNorm);
    return { matched, source: 'exact_query', score: 1 };
  }

  if (tNorm && titleMap.has(tNorm)) {
    const matched = titleMap.get(tNorm);
    return { matched, source: 'exact_title', score: 0.95 };
  }

  const qTokens = tokenize(queryItem.name || '');
  let best = null;
  let bestScore = 0;

  for (const c of candidates) {
    const base = jaccard(qTokens, c.titleTokens);
    if (base === 0) continue;

    let score = base;
    if (c.brandCode === brandCode) score += 0.15;
    if (tNorm && c.titleNorm.includes(tNorm)) score += 0.1;
    if (tNorm && tNorm.includes(c.titleNorm) && c.titleNorm.length >= 4) score += 0.1;
    score = Math.min(score, 0.99);

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  if (best && bestScore >= 0.2) {
    return { matched: best, source: 'fuzzy_title', score: Number(bestScore.toFixed(3)) };
  }

  const brandDefault = pickBrandDefaultPrompt(candidates, brandCode);
  if (brandDefault) {
    return { matched: brandDefault, source: 'brand_default', score: 0.1 };
  }

  return { matched: null, source: 'none', score: 0 };
}

async function main() {
  const [insightsRaw, queriesRaw] = await Promise.all([
    redis.get(INSIGHTS_KEY),
    redis.get(QUERIES_KEY),
  ]);

  const insights = Array.isArray(insightsRaw) ? insightsRaw : [];
  const queries = Array.isArray(queriesRaw) ? queriesRaw : [];

  const promptInsights = insights
    .filter((i) => String(i.analysisRequest || '').trim())
    .map((i) => ({
      id: i.id,
      title: i.title || '',
      query: i.query || '',
      prompt: String(i.analysisRequest || '').trim(),
      createdAt: i.createdAt || '',
      brandCode: detectBrandCodeFromInsight(i),
      titleNorm: normalizeTitle(i.title || ''),
      queryNorm: normalizeQuery(i.query || ''),
      titleTokens: tokenize(i.title || ''),
    }));

  const queryMap = new Map();
  const titleMap = new Map();

  for (const c of promptInsights) {
    if (c.queryNorm.length > 30 && !queryMap.has(c.queryNorm)) {
      queryMap.set(c.queryNorm, c);
    }
    if (c.titleNorm && !titleMap.has(c.titleNorm)) {
      titleMap.set(c.titleNorm, c);
    }
  }

  const changes = [];
  const updatedQueries = queries.map((q) => {
    const current = String(q.analysisRequest || '').trim();
    const { matched, source, score } = matchPromptForQuery(q, promptInsights, queryMap, titleMap);
    const next = matched?.prompt || current;
    if (!next || current === next) return q;

    changes.push({
      id: q.id,
      name: q.name,
      brand: q.brand || '',
      source,
      score,
      fromLen: current.length,
      toLen: next.length,
      matchedInsightId: matched?.id || null,
      matchedInsightTitle: matched?.title || null,
    });
    return { ...q, analysisRequest: next };
  });

  const withPromptAfter = updatedQueries.filter((q) => String(q.analysisRequest || '').trim()).length;
  const sourceStats = changes.reduce((acc, c) => {
    acc[c.source] = (acc[c.source] || 0) + 1;
    return acc;
  }, {});

  const stamp = timestamp();
  const reportPath = path.join(dataDir, `link-query-prompts-report-${stamp}.json`);
  const report = {
    apply: APPLY,
    summary: {
      queriesTotal: queries.length,
      promptsInInsights: promptInsights.length,
      changed: changes.length,
      queriesWithPromptAfter: withPromptAfter,
      coverageAfter: `${withPromptAfter}/${queries.length}`,
      sourceStats,
    },
    changes: changes.slice(0, 1000),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  let backupPath = null;
  if (APPLY) {
    backupPath = path.join(dataDir, `saved-queries-backup-before-link-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(queries, null, 2), 'utf8');
    await redis.set(QUERIES_KEY, updatedQueries);
  }

  console.log(JSON.stringify({ reportPath, backupPath, ...report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
