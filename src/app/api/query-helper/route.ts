import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getMultipleTableSchemas } from '@/lib/snowflake';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { currentQuery, userRequest, tableImage, tables } = await request.json();

    if (!userRequest && !tableImage && (!tables || tables.length === 0)) {
      return NextResponse.json(
        { error: '요청 내용, 테이블 이미지, 또는 테이블 목록이 필요합니다.' },
        { status: 400 }
      );
    }

    const messages: Anthropic.MessageParam[] = [];
    const content: Anthropic.ContentBlockParam[] = [];

    // 테이블 이미지가 있으면 추가
    if (tableImage) {
      // Base64 이미지 처리
      const base64Data = tableImage.replace(/^data:image\/\w+;base64,/, '');
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: base64Data,
        },
      });
    }

    // 텍스트 프롬프트 구성
    let prompt = `당신은 Snowflake SQL 전문가입니다. 사용자의 요청에 맞는 SQL 쿼리를 생성하거나 수정해주세요.

## 규칙
- Snowflake SQL 문법을 사용하세요
- 쿼리만 반환하세요 (설명 없이)
- 주석은 한글로 작성하세요
- 가독성 좋게 포맷팅하세요

`;

    // Snowflake에서 실제 테이블 스키마 가져오기
    if (tables && tables.length > 0) {
      try {
        const schemaInfo = await getMultipleTableSchemas(tables);
        prompt += `## 데이터베이스 테이블 구조 (실제 Snowflake에서 조회)
${schemaInfo}

`;
      } catch (error) {
        console.error('테이블 스키마 조회 오류:', error);
        // 스키마 조회 실패해도 계속 진행
      }
    }

    if (tableImage) {
      prompt += `## 추가 테이블 구조 (이미지)
위 이미지에도 테이블 구조가 있을 수 있습니다. 이것도 참고하여 쿼리를 작성하세요.

`;
    }

    if (currentQuery && currentQuery.trim()) {
      prompt += `## 현재 쿼리
\`\`\`sql
${currentQuery}
\`\`\`

`;
    }

    prompt += `## 사용자 요청
${userRequest || '위 테이블 구조를 기반으로 기본 SELECT 쿼리를 생성해주세요.'}

## 응답
SQL 쿼리만 반환하세요:`;

    content.push({
      type: 'text',
      text: prompt,
    });

    messages.push({
      role: 'user',
      content,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages,
    });

    const textContent = response.content.find((c) => c.type === 'text');
    let generatedQuery = textContent?.type === 'text' ? textContent.text : '';

    // SQL 코드 블록 제거
    generatedQuery = generatedQuery
      .replace(/```sql\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();

    return NextResponse.json({
      success: true,
      query: generatedQuery,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    });
  } catch (error) {
    console.error('Query helper error:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
