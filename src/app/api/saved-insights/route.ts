import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const INSIGHTS_KEY = 'fnf-shared-insights';

// Upstash Redis 연결
const getRedis = () => {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  const url = kvUrl || upstashUrl;
  const token = kvToken || upstashToken;
  
  if (!url || !token) {
    return null;
  }
  
  return new Redis({ url, token });
};

interface SavedInsight {
  id: string;
  title: string;
  brandName?: string;
  insight: string;
  query?: string;
  tokensUsed: number;
  model: string;
  createdAt: string;
  createdBy?: string;
}

// 모든 저장된 인사이트 조회
export async function GET() {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json({
        success: true,
        insights: [],
        fallback: true,
        message: 'Redis가 설정되지 않았습니다.',
      });
    }
    
    const insights = await redis.get<SavedInsight[]>(INSIGHTS_KEY);
    return NextResponse.json({
      success: true,
      insights: insights || [],
    });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json({
      success: true,
      insights: [],
      fallback: true,
    });
  }
}

// 새 인사이트 저장
export async function POST(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다. Vercel 대시보드에서 환경 변수를 확인해주세요.' },
        { status: 500 }
      );
    }

    const { title, brandName, insight, query, tokensUsed, model, createdBy } = await request.json();

    if (!title || !insight) {
      return NextResponse.json(
        { error: '제목과 인사이트 내용이 필요합니다.' },
        { status: 400 }
      );
    }

    const newInsight: SavedInsight = {
      id: `insight-${Date.now()}`,
      title,
      brandName: brandName || undefined,
      insight,
      query: query || undefined,
      tokensUsed: tokensUsed || 0,
      model: model || 'unknown',
      createdAt: new Date().toISOString(),
      createdBy: createdBy || '익명',
    };

    // 기존 인사이트 조회
    let insights = await redis.get<SavedInsight[]>(INSIGHTS_KEY) || [];
    
    // 새 인사이트 추가 (최신순)
    insights = [newInsight, ...insights];
    
    // 최대 50개로 제한
    if (insights.length > 50) {
      insights = insights.slice(0, 50);
    }

    await redis.set(INSIGHTS_KEY, insights);

    return NextResponse.json({
      success: true,
      insight: newInsight,
    });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json(
      { error: 'Redis 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 인사이트 삭제
export async function DELETE(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: '삭제할 인사이트 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    let insights = await redis.get<SavedInsight[]>(INSIGHTS_KEY) || [];
    insights = insights.filter((i) => i.id !== id);
    
    await redis.set(INSIGHTS_KEY, insights);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json(
      { error: 'Redis 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
