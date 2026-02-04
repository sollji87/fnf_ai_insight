import Anthropic from '@anthropic-ai/sdk';
import type { InsightResponse } from '@/types';
import { SYSTEM_PROMPT } from './prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// 텍스트를 대략적인 토큰 수로 추정 (한글 1글자 = 약 2토큰, 영문/숫자 4글자 = 약 1토큰)
function estimateTokens(text: string): number {
  const koreanChars = (text.match(/[가-힣]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars * 2 + otherChars / 4);
}

// 프롬프트가 너무 길면 데이터 부분을 줄임
function truncatePromptIfNeeded(prompt: string, maxTokens: number = 150000): string {
  const estimated = estimateTokens(prompt);
  
  if (estimated <= maxTokens) {
    return prompt;
  }

  // 데이터 테이블 부분 찾기
  const dataMatch = prompt.match(/<데이터>([\s\S]*?)<\/데이터>/);
  if (!dataMatch) {
    // 데이터 태그가 없으면 그냥 텍스트 길이로 자르기
    const ratio = maxTokens / estimated;
    return prompt.slice(0, Math.floor(prompt.length * ratio * 0.8)) + '\n\n(데이터가 너무 길어 일부만 표시됨)';
  }

  const dataContent = dataMatch[1];
  const dataLines = dataContent.trim().split('\n');
  
  // 헤더와 구분선 유지, 데이터 행 줄이기
  const headerLines = dataLines.slice(0, 2);
  const dataRows = dataLines.slice(2);
  
  // 필요한 만큼 행 줄이기
  const targetRatio = maxTokens / estimated;
  const maxRows = Math.max(10, Math.floor(dataRows.length * targetRatio * 0.7));
  const truncatedRows = dataRows.slice(0, maxRows);
  
  const truncatedData = [...headerLines, ...truncatedRows].join('\n') + 
    `\n\n(총 ${dataRows.length}개 행 중 ${maxRows}개만 표시)`;
  
  return prompt.replace(dataMatch[0], `<데이터>\n${truncatedData}\n</데이터>`);
}

export async function generateInsight(
  systemPrompt: string,
  userPrompt: string,
  model: string = 'claude-sonnet-4-5-20250929'
): Promise<InsightResponse> {
  const startTime = Date.now();

  // 프롬프트 길이 체크 및 필요시 자르기
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

// 외부 소스 타입 정의
interface ExternalSource {
  name: string;
  type: 'excel' | 'image' | 'text' | 'pdf';
  content: string;
}

export async function generateBrandSummary(
  brandInsights: { brandName: string; insight: string }[],
  customPrompt?: string,
  externalSources?: ExternalSource[]
): Promise<InsightResponse> {
  const startTime = Date.now();
  const model = 'claude-sonnet-4-5-20250929';

  const defaultInstructions = `위 브랜드별 인사이트를 바탕으로 다음 내용을 포함하여 종합 분석해주세요:
1. 전체 브랜드 성과 요약
2. 브랜드간 비교 분석 (강점/약점)
3. 주목해야 할 이상징후
4. 전사 차원의 전략적 제언`;

  const userInstructions = customPrompt || defaultInstructions;

  // 브랜드 인사이트 섹션
  const insightsSection = brandInsights.length > 0
    ? `# 브랜드별 인사이트

${brandInsights
  .map(
    (bi) => `## ${bi.brandName}
${bi.insight}
`
  )
  .join('\n---\n\n')}`
    : '';

  // 외부 소스 섹션 (이미지 제외)
  const textSources = externalSources?.filter(s => s.type !== 'image') || [];
  const imageSources = externalSources?.filter(s => s.type === 'image') || [];

  const externalTextSection = textSources.length > 0
    ? `\n\n# 외부 참고 자료

${textSources.map(s => s.content).join('\n\n---\n\n')}`
    : '';

  // 기본 텍스트 프롬프트 구성
  const basePrompt = `다음은 분석할 자료입니다. 이를 종합하여 전체 요약 및 분석을 마크다운 형식으로 작성해주세요.

${insightsSection}${externalTextSection}

<분석 지침>
${userInstructions}
</분석 지침>`;

  // 이미지가 있는 경우 멀티모달 API 사용
  if (imageSources.length > 0) {
    const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    // 이미지 추가
    for (const img of imageSources) {
      // data:image/png;base64,... 형식에서 추출
      const matches = img.content.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
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
          text: `[위 이미지: ${img.name}]`,
        });
      }
    }

    // 텍스트 프롬프트 추가
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

  // 이미지가 없는 경우 기존 방식
  return generateInsight(SYSTEM_PROMPT, basePrompt);
}
