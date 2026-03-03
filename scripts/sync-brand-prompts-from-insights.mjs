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

function timestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function stripBrandFromTitle(title = '') {
  let out = String(title || '');
  out = out.replace(/_/g, ' ');
  out = out.replace(/^(MLB\s*KIDS|MLB|DISCOVERY|DUVETICA|SERGIO\s*TACCHINI|MK|DX|DV|ST|M|I|X|V)\b[\s\-]*/i, '');
  out = out.replace(/\s*\((MK|DX|DV|ST|M|I|X|V)\)\s*$/i, '');
  out = out.replace(/\s+/g, ' ');
  return out.trim().toLowerCase();
}

function normalizeQueryForMatching(query = '') {
  return String(query)
    .replace(/brd_cd\s*=\s*'[A-Z]{1,2}'/gi, "brd_cd='M'")
    .replace(/brd_cd\s+in\s*\(([^)]*)\)/gi, "brd_cd in ('M')")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function groupKeyForInsight(item) {
  const queryNorm = normalizeQueryForMatching(item.query || '');
  if (queryNorm.length > 30) {
    return `q:${queryNorm}`;
  }
  const titleNorm = stripBrandFromTitle(item.title || '');
  return `t:${titleNorm}`;
}

function pickCanonicalPrompt(groupItems) {
  const withPrompt = groupItems.filter((x) => String(x.analysisRequest || '').trim());
  if (withPrompt.length === 0) return '';

  withPrompt.sort((a, b) => {
    const la = String(a.analysisRequest || '').length;
    const lb = String(b.analysisRequest || '').length;
    if (lb !== la) return lb - la;
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });

  return String(withPrompt[0].analysisRequest || '').trim();
}

function upsertLongestPrompt(map, key, item) {
  const prompt = String(item.analysisRequest || '').trim();
  if (!prompt || !key) return;

  const current = map.get(key);
  if (!current || prompt.length > current.prompt.length) {
    map.set(key, { prompt, insightId: item.id, title: item.title });
  }
}

function buildPromptMapFromInsights(insights) {
  const queryMap = new Map();
  const titleMap = new Map();
  for (const item of insights) {
    const queryNorm = normalizeQueryForMatching(item.query || '');
    const titleNorm = stripBrandFromTitle(item.title || '');
    if (queryNorm.length > 30) {
      upsertLongestPrompt(queryMap, `q:${queryNorm}`, item);
    }
    if (titleNorm) {
      upsertLongestPrompt(titleMap, `t:${titleNorm}`, item);
    }
  }
  return { queryMap, titleMap };
}

async function main() {
  const [insightsRaw, queriesRaw] = await Promise.all([
    redis.get(INSIGHTS_KEY),
    redis.get(QUERIES_KEY),
  ]);

  const insights = Array.isArray(insightsRaw) ? insightsRaw : [];
  const queries = Array.isArray(queriesRaw) ? queriesRaw : [];

  const groups = new Map();
  for (const item of insights) {
    const key = groupKeyForInsight(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const insightChanges = [];
  const updatedInsights = insights.map((item) => {
    const key = groupKeyForInsight(item);
    const group = groups.get(key) || [item];
    const canonical = pickCanonicalPrompt(group);
    const current = String(item.analysisRequest || '').trim();
    if (!canonical || current === canonical) return item;

    insightChanges.push({
      id: item.id,
      title: item.title,
      brandName: item.brandName || '',
      fromLen: current.length,
      toLen: canonical.length,
      key,
      reason: 'same-query cross-brand sync',
    });
    return { ...item, analysisRequest: canonical };
  });

  const { queryMap, titleMap } = buildPromptMapFromInsights(updatedInsights);
  const queryChanges = [];
  const updatedQueries = queries.map((q) => {
    const queryNorm = normalizeQueryForMatching(q.query || '');
    const titleNorm = stripBrandFromTitle(q.name || '');
    const queryKey = queryNorm.length > 30 ? `q:${queryNorm}` : '';
    const titleKey = titleNorm ? `t:${titleNorm}` : '';
    const queryCanonical = queryKey ? queryMap.get(queryKey)?.prompt || '' : '';
    const titleCanonical = titleKey ? titleMap.get(titleKey)?.prompt || '' : '';
    const canonical = queryCanonical || titleCanonical || '';
    const current = String(q.analysisRequest || '').trim();
    if (!canonical || current === canonical) return q;

    queryChanges.push({
      id: q.id,
      name: q.name,
      brand: q.brand || '',
      fromLen: current.length,
      toLen: canonical.length,
      key: queryCanonical ? queryKey : titleKey,
      reason: 'linked from synced insights',
    });
    return { ...q, analysisRequest: canonical };
  });

  const finalInsightCoverage = updatedInsights.filter((x) => String(x.analysisRequest || '').trim()).length;
  const finalQueryCoverage = updatedQueries.filter((x) => String(x.analysisRequest || '').trim()).length;

  const stamp = timestamp();
  const reportPath = path.join(dataDir, `sync-brand-prompts-report-${stamp}.json`);
  const report = {
    apply: APPLY,
    summary: {
      insightsTotal: insights.length,
      queriesTotal: queries.length,
      insightChanged: insightChanges.length,
      queryChanged: queryChanges.length,
      insightsWithPromptAfter: finalInsightCoverage,
      queriesWithPromptAfter: finalQueryCoverage,
      groupCount: groups.size,
    },
    insightChanges: insightChanges.slice(0, 500),
    queryChanges: queryChanges.slice(0, 500),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  let backups = null;
  if (APPLY) {
    const insightsBackupPath = path.join(dataDir, `saved-insights-backup-before-sync-${stamp}.json`);
    const queriesBackupPath = path.join(dataDir, `saved-queries-backup-before-sync-${stamp}.json`);
    fs.writeFileSync(insightsBackupPath, JSON.stringify(insights, null, 2), 'utf8');
    fs.writeFileSync(queriesBackupPath, JSON.stringify(queries, null, 2), 'utf8');

    await redis.set(INSIGHTS_KEY, updatedInsights);
    await redis.set(QUERIES_KEY, updatedQueries);

    backups = { insightsBackupPath, queriesBackupPath };
  }

  console.log(JSON.stringify({ reportPath, backups, ...report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
