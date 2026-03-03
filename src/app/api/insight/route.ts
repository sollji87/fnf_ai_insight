import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, formatQueryResultForPrompt } from '@/lib/snowflake';
import { generateInsight, generateBrandSummary } from '@/lib/claude';
import {
  SYSTEM_PROMPT,
  DEFAULT_USER_PROMPT_TEMPLATE,
  getBrandPolicyPrompt,
  normalizeBrandCode,
  BRAND_PROMPT_PROFILES,
} from '@/lib/prompts';

const UNIT_POLICY_PROMPT = `
<Unit Policy>
- Monetary columns may be provided as *_KRW and/or *_MIL_KRW.
- Prefer *_MIL_KRW for narrative and comparisons.
- Use *_KRW only when exact amount is needed.
- For cost-to-sales profitability ratios, use ACT_SALE_AMT * 1.1 basis.
</Unit Policy>
`;

const DEFAULT_ANALYSIS_REQUEST = '당월(2026년 2월)과 전년동월(2025년 2월) 중심으로 경영 관점 분석을 작성해줘.';

function getBrandDefaultAnalysisRequest(brandName?: string | null): string {
  const code = normalizeBrandCode(brandName);
  if (!code) return DEFAULT_ANALYSIS_REQUEST;

  const profile = BRAND_PROMPT_PROFILES[code];
  return `당월(2026년 2월)과 전년동월(2025년 2월), 최근 12개월(202503~202602) 기준으로 ${profile.name} 성과를 분석하고 핵심 원인/리스크/실행 과제를 제시해줘.`;
}

export async function POST(request: NextRequest) {
  try {
    const {
      query,
      systemPrompt,
      userPrompt,
      analysisRequest,
      brandName,
    } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'SQL 쿼리가 필요합니다.' },
        { status: 400 }
      );
    }

    const queryResult = await executeQuery(query);
    const formattedData = formatQueryResultForPrompt(queryResult);
    const defaultAnalysisRequest = getBrandDefaultAnalysisRequest(brandName);

    const finalUserPrompt = userPrompt
      ? userPrompt
          .replace('{{DATA}}', formattedData)
          .replace('{{ANALYSIS_REQUEST}}', analysisRequest || defaultAnalysisRequest)
      : DEFAULT_USER_PROMPT_TEMPLATE
          .replace('{{DATA}}', formattedData)
          .replace('{{ANALYSIS_REQUEST}}', analysisRequest || defaultAnalysisRequest);

    const brandPolicyPrompt = getBrandPolicyPrompt(brandName);
    const finalSystemPrompt = [systemPrompt || SYSTEM_PROMPT, UNIT_POLICY_PROMPT, brandPolicyPrompt]
      .filter(Boolean)
      .join('\n\n');

    const insightResult = await generateInsight(finalSystemPrompt, finalUserPrompt);

    return NextResponse.json({
      success: true,
      brandName: brandName || null,
      queryResult,
      insight: insightResult.insight,
      tokensUsed: insightResult.tokensUsed,
      responseTime: insightResult.responseTime,
      model: insightResult.model,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { brandInsights, customPrompt, externalSources } = await request.json();

    if ((!brandInsights || !Array.isArray(brandInsights) || brandInsights.length === 0) &&
        (!externalSources || !Array.isArray(externalSources) || externalSources.length === 0)) {
      return NextResponse.json(
        { error: '브랜드 인사이트 또는 외부 소스가 필요합니다.' },
        { status: 400 }
      );
    }

    const summaryResult = await generateBrandSummary(
      brandInsights || [],
      customPrompt,
      externalSources
    );

    return NextResponse.json({
      success: true,
      summary: summaryResult.insight,
      tokensUsed: summaryResult.tokensUsed,
      responseTime: summaryResult.responseTime,
      model: summaryResult.model,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
