import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import type { RegionId } from '@/types';

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
  analysisRequest?: string;
  tokensUsed: number;
  model: string;
  region?: RegionId; // 국가/지역 (없으면 'domestic'으로 간주)
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
    
    let insights = await redis.get<SavedInsight[]>(INSIGHTS_KEY) || [];
    
    // 기존 인사이트에 region이 없으면 'domestic'으로 마이그레이션
    let needsMigration = false;
    insights = insights.map(insight => {
      if (!insight.region) {
        needsMigration = true;
        return { ...insight, region: 'domestic' as RegionId };
      }
      return insight;
    });
    
    // 마이그레이션이 필요하면 저장
    if (needsMigration) {
      await redis.set(INSIGHTS_KEY, insights);
    }
    
    return NextResponse.json({
      success: true,
      insights,
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

    const { title, brandName, insight, query, analysisRequest, tokensUsed, model, region, createdBy } = await request.json();

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
      analysisRequest: analysisRequest || undefined,
      tokensUsed: tokensUsed || 0,
      model: model || 'unknown',
      region: region || 'domestic', // 국가 정보 (기본값: domestic)
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

// 인사이트 업데이트
export async function PATCH(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { id, insight } = await request.json();

    if (!id || !insight) {
      return NextResponse.json(
        { error: '인사이트 ID와 내용이 필요합니다.' },
        { status: 400 }
      );
    }

    let insights = await redis.get<SavedInsight[]>(INSIGHTS_KEY) || [];
    const insightIndex = insights.findIndex((i) => i.id === id);
    
    if (insightIndex === -1) {
      return NextResponse.json(
        { error: '인사이트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 인사이트 업데이트
    insights[insightIndex] = {
      ...insights[insightIndex],
      insight,
    };
    
    await redis.set(INSIGHTS_KEY, insights);

    return NextResponse.json({
      success: true,
      insight: insights[insightIndex],
    });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json(
      { error: 'Redis 업데이트 중 오류가 발생했습니다.' },
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
