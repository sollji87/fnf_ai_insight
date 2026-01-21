import Anthropic from '@anthropic-ai/sdk';
import type { InsightResponse } from '@/types';
import { SYSTEM_PROMPT } from './prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function generateInsight(
  systemPrompt: string,
  userPrompt: string,
  model: string = 'claude-sonnet-4-20250514'
): Promise<InsightResponse> {
  const startTime = Date.now();

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt || SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
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

export async function generateBrandSummary(
  brandInsights: { brandName: string; insight: string }[]
): Promise<InsightResponse> {
  const summaryPrompt = `다음은 각 브랜드별 AI 분석 인사이트입니다. 이를 종합하여 전체 브랜드 요약 및 비교 분석을 마크다운 형식으로 작성해주세요.

${brandInsights
  .map(
    (bi) => `## ${bi.brandName}
${bi.insight}
`
  )
  .join('\n---\n\n')}

위 브랜드별 인사이트를 바탕으로 다음 내용을 포함하여 종합 분석해주세요:
1. 전체 브랜드 성과 요약
2. 브랜드간 비교 분석 (강점/약점)
3. 주목해야 할 이상징후
4. 전사 차원의 전략적 제언`;

  return generateInsight(SYSTEM_PROMPT, summaryPrompt);
}
