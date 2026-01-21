import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, formatQueryResultForPrompt } from '@/lib/snowflake';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'SQL 쿼리가 필요합니다.' },
        { status: 400 }
      );
    }

    const result = await executeQuery(query);
    const formattedData = formatQueryResultForPrompt(result);

    return NextResponse.json({
      success: true,
      data: result,
      formattedData,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
