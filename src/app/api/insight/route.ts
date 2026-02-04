import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, formatQueryResultForPrompt } from '@/lib/snowflake';
import { generateInsight, generateBrandSummary } from '@/lib/claude';
import { SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE } from '@/lib/prompts';

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

    const finalUserPrompt = userPrompt
      ? userPrompt
          .replace('{{DATA}}', formattedData)
          .replace('{{ANALYSIS_REQUEST}}', analysisRequest || '전반적인 경영 현황을 분석해주세요.')
      : DEFAULT_USER_PROMPT_TEMPLATE
          .replace('{{DATA}}', formattedData)
          .replace('{{ANALYSIS_REQUEST}}', analysisRequest || '전반적인 경영 현황을 분석해주세요.');

    const insightResult = await generateInsight(
      systemPrompt || SYSTEM_PROMPT,
      finalUserPrompt
    );

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

    // 브랜드 인사이트 또는 외부 소스 중 하나는 필요
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
