import { NextRequest, NextResponse } from 'next/server';
import { generateInsight } from '@/lib/claude';

export async function POST(request: NextRequest) {
  try {
    const { systemPrompt, userPrompt, model } = await request.json();

    if (!userPrompt || typeof userPrompt !== 'string') {
      return NextResponse.json(
        { error: '사용자 프롬프트가 필요합니다.' },
        { status: 400 }
      );
    }

    const result = await generateInsight(
      systemPrompt || '',
      userPrompt,
      model || 'claude-sonnet-4-20250514'
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
