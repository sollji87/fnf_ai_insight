import Anthropic from '@anthropic-ai/sdk';
import type { InsightResponse } from '@/types';
import { SYSTEM_PROMPT } from './prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  timeout: 60 * 60 * 1000,
});

function getMaxOutputTokens(): number {
  const raw = process.env.CLAUDE_MAX_OUTPUT_TOKENS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1024) {
    return parsed;
  }
  return 64000;
}

function getMaxContinuationTurns(): number {
  const raw = process.env.CLAUDE_MAX_CONTINUATION_TURNS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 20) {
    return parsed;
  }
  return 6;
}

const CONTINUATION_PROMPT =
  'Continue exactly where you left off. Do not restart, summarize, or repeat earlier sections.';

function extractTextContent(content: Anthropic.Messages.Message['content']): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => ('text' in block ? block.text : ''))
    .join('\n')
    .trim();
}

function warnIfTruncated(
  response: Anthropic.Messages.Message,
  context: { model: string; maxOutputTokens: number; pass: number }
): void {
  if (response.stop_reason !== 'max_tokens') return;
  console.warn(
    `[claude] response truncated (stop_reason=max_tokens): model=${context.model}, pass=${context.pass}, max_tokens=${context.maxOutputTokens}, input_tokens=${response.usage.input_tokens}, output_tokens=${response.usage.output_tokens}`
  );
}

interface ContinuationResult {
  text: string;
  tokensUsed: number;
}

async function generateWithContinuation(
  model: string,
  maxOutputTokens: number,
  system: string,
  seedMessages: Anthropic.MessageParam[]
): Promise<ContinuationResult> {
  const maxTurns = getMaxContinuationTurns();
  const messages = [...seedMessages];
  let fullText = '';
  let totalTokensUsed = 0;

  for (let pass = 1; pass <= maxTurns; pass += 1) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxOutputTokens,
      system,
      messages,
    });

    totalTokensUsed += response.usage.input_tokens + response.usage.output_tokens;
    const chunk = extractTextContent(response.content);
    if (chunk) {
      fullText = fullText ? `${fullText}\n${chunk}` : chunk;
    }

    if (response.stop_reason !== 'max_tokens') {
      return { text: fullText, tokensUsed: totalTokensUsed };
    }

    warnIfTruncated(response, { model, maxOutputTokens, pass });
    if (pass === maxTurns) {
      console.warn(
        `[claude] continuation limit reached: model=${model}, max_turns=${maxTurns}, max_tokens=${maxOutputTokens}`
      );
      return { text: fullText, tokensUsed: totalTokensUsed };
    }

    messages.push({ role: 'assistant', content: chunk || '...' });
    messages.push({ role: 'user', content: CONTINUATION_PROMPT });
  }

  return { text: fullText, tokensUsed: totalTokensUsed };
}

// Rough token estimator for proactive prompt truncation.
function estimateTokens(text: string): number {
  const koreanChars = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars * 2 + otherChars / 4);
}

type DataBlockMatch = {
  fullMatch: string;
  content: string;
};

function findDataBlock(prompt: string): DataBlockMatch | null {
  const match = prompt.match(/<DATA>([\s\S]*?)<\/DATA>/i);
  if (!match) return null;

  return {
    fullMatch: match[0],
    content: match[1],
  };
}

// If prompt grows too large, trim only the DATA block first.
function truncatePromptIfNeeded(prompt: string, maxTokens: number = 120000): string {
  const estimated = estimateTokens(prompt);

  if (estimated <= maxTokens) {
    return prompt;
  }

  const dataBlock = findDataBlock(prompt);
  if (!dataBlock) {
    const ratio = maxTokens / estimated;
    const cut = Math.floor(prompt.length * ratio * 0.8);
    return `${prompt.slice(0, cut)}\n\n(data truncated due to token limit)`;
  }

  const dataLines = dataBlock.content.trim().split('\n');
  if (dataLines.length <= 12) {
    return prompt;
  }

  const headerLines = dataLines.slice(0, 2);
  const bodyLines = dataLines.slice(2);
  const targetRatio = maxTokens / estimated;
  const maxBodyLines = Math.max(10, Math.floor(bodyLines.length * targetRatio * 0.7));
  const truncatedBody = bodyLines.slice(0, maxBodyLines);

  const truncatedData = `${[...headerLines, ...truncatedBody].join('\n')}\n\n(total rows ${bodyLines.length}, shown ${maxBodyLines})`;

  return prompt.replace(dataBlock.fullMatch, `<DATA>\n${truncatedData}\n</DATA>`);
}

export async function generateInsight(
  systemPrompt: string,
  userPrompt: string,
  model: string = 'claude-sonnet-4-6'
): Promise<InsightResponse> {
  const startTime = Date.now();
  const maxOutputTokens = getMaxOutputTokens();
  const truncatedUserPrompt = truncatePromptIfNeeded(userPrompt);
  const completion = await generateWithContinuation(model, maxOutputTokens, systemPrompt || SYSTEM_PROMPT, [
    {
      role: 'user',
      content: truncatedUserPrompt,
    },
  ]);
  const responseTime = Date.now() - startTime;

  return {
    insight: completion.text,
    tokensUsed: completion.tokensUsed,
    responseTime,
    model,
  };
}

interface ExternalSource {
  name: string;
  type: 'excel' | 'image' | 'text' | 'pdf';
  content: string;
}

interface BrandSummarySourceItem {
  brandName: string;
  insight: string;
  sourceId?: string;
  sourceTitle?: string;
  yearMonth?: string;
  region?: string;
  createdAt?: string;
}

function buildSummarySourceBlock(item: BrandSummarySourceItem, index: number): string {
  const sourceId = item.sourceId || `source-${index + 1}`;
  const meta = [
    `- SOURCE_ID: ${sourceId}`,
    item.sourceTitle ? `- SOURCE_TITLE: ${item.sourceTitle}` : '',
    item.yearMonth ? `- YEAR_MONTH: ${item.yearMonth}` : '',
    item.region ? `- REGION: ${item.region}` : '',
    item.createdAt ? `- CREATED_AT: ${item.createdAt}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `## ${item.brandName}\n${meta}\n${item.insight}`;
}

export async function generateBrandSummary(
  brandInsights: BrandSummarySourceItem[],
  customPrompt?: string,
  externalSources?: ExternalSource[]
): Promise<InsightResponse> {
  const startTime = Date.now();
  const maxOutputTokens = getMaxOutputTokens();
  const model = 'claude-sonnet-4-6';

  const defaultInstructions = `Write a Korean markdown executive summary using only the provided source insights.

Hard rules:
- Do not invent numbers, percentages, rankings, probabilities, or confidence values.
- Every numeric claim must include citation tags in the form [src:SOURCE_ID].
- If sources conflict, create a "Data Conflicts" subsection and show both values with citations.
- If evidence is insufficient, explicitly write "데이터 부족" and avoid speculation.
- Keep output concise: target 900-1500 Korean characters (excluding tables).

Required output sections:
1) Executive Summary (3-5 bullets)
2) Cross-Brand Comparison (strengths / weaknesses)
3) Risks / Anomalies (Top 3)
4) Action Plan (Immediate / 30-90 days)
5) Data Conflicts or Data Gaps`;

  const enforcedUnitRules = `Non-overridable unit & format rules:
- Output must be Korean markdown only (no JSON/YAML/object format).
- All monetary values in narrative and tables must be expressed in "백만원".
- Prefer *_MIL_KRW directly when available.
- If only *_KRW(원) is available, convert to 백만원 (= KRW / 1,000,000) and round to one decimal.
- Do not use 원, KRW, or 억원 as final display units in the report.
- Keep percentage/ratio units as-is.`;

  const readabilityStyleRules = `Non-overridable readability & executive tone rules:
- Keep sentences concise and explicit. Prefer one point per sentence.
- Avoid repeating the same metric/value across sections.
- For each bullet, write conclusion first, then one supporting number with citation.
- Use neutral executive language (no hype, no vague adjectives).
- Keep each section skimmable: 2-5 bullets unless data is insufficient.
- If evidence is weak, state the limitation briefly and move on.
- Keep each bullet to max 2 sentences.
- Keep each bullet line short (target within ~120 Korean characters).
- If multiple numbers are needed, move detailed values into a markdown table instead of one long sentence.`;

  const userInstructions = customPrompt?.trim() ? customPrompt.trim() : defaultInstructions;
  const finalInstructions = `${userInstructions}\n\n${enforcedUnitRules}\n\n${readabilityStyleRules}`.trim();

  const insightsSection = brandInsights.length > 0
    ? `# Brand Insights\n\n${brandInsights
        .map((item, index) => buildSummarySourceBlock(item, index))
        .join('\n\n---\n\n')}`
    : '';

  const textSources = externalSources?.filter((s) => s.type !== 'image') || [];
  const imageSources = externalSources?.filter((s) => s.type === 'image') || [];

  const externalTextSection = textSources.length > 0
    ? `\n\n# External Sources\n\n${textSources.map((s) => s.content).join('\n\n---\n\n')}`
    : '';

  const basePrompt = `다음 자료를 종합해 한국어 마크다운 요약 보고서를 작성해주세요.

<DATA>
${insightsSection}${externalTextSection}
</DATA>

<ANALYSIS_REQUEST>
${finalInstructions}
</ANALYSIS_REQUEST>`;

  if (imageSources.length > 0) {
    const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    for (const img of imageSources) {
      const matches = img.content.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) continue;

      const mediaType = matches[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      const base64Data = matches[2];

      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data,
        },
      });
      contentBlocks.push({
        type: 'text',
        text: `[image: ${img.name}]`,
      });
    }

    contentBlocks.push({
      type: 'text',
      text: basePrompt,
    });

    const completion = await generateWithContinuation(model, maxOutputTokens, SYSTEM_PROMPT, [
      {
        role: 'user',
        content: contentBlocks,
      },
    ]);
    const responseTime = Date.now() - startTime;

    return {
      insight: completion.text,
      tokensUsed: completion.tokensUsed,
      responseTime,
      model,
    };
  }

  return generateInsight(SYSTEM_PROMPT, basePrompt, model);
}
