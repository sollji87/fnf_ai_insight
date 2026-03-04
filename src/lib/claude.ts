import Anthropic from '@anthropic-ai/sdk';
import type { InsightResponse } from '@/types';
import { SYSTEM_PROMPT } from './prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

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
  model: string = 'claude-sonnet-4-5-20250929'
): Promise<InsightResponse> {
  const startTime = Date.now();
  const truncatedUserPrompt = truncatePromptIfNeeded(userPrompt);

  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt || SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: truncatedUserPrompt,
      },
    ],
  });

  const responseTime = Date.now() - startTime;
  const textContent = response.content.find((block) => block.type === 'text');
  const insight = textContent && 'text' in textContent ? textContent.text : '';

  return {
    insight,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
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
  const model = 'claude-sonnet-4-5-20250929';

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

  const userInstructions = customPrompt?.trim() ? customPrompt.trim() : defaultInstructions;

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
${userInstructions}
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

    const response = await anthropic.messages.create({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
    });

    const responseTime = Date.now() - startTime;
    const textContent = response.content.find((block) => block.type === 'text');
    const insight = textContent && 'text' in textContent ? textContent.text : '';

    return {
      insight,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      responseTime,
      model,
    };
  }

  return generateInsight(SYSTEM_PROMPT, basePrompt, model);
}
