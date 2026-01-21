import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const QUERIES_KEY = 'fnf-shared-queries';

// Upstash Redis 연결 (여러 환경 변수 형식 지원)
const getRedis = () => {
  // Vercel KV 형식
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  
  // Upstash 형식
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  const url = kvUrl || upstashUrl;
  const token = kvToken || upstashToken;
  
  if (!url || !token) {
    console.log('Redis 환경 변수 확인:', {
      KV_REST_API_URL: !!kvUrl,
      KV_REST_API_TOKEN: !!kvToken,
      UPSTASH_REDIS_REST_URL: !!upstashUrl,
      UPSTASH_REDIS_REST_TOKEN: !!upstashToken,
    });
    return null;
  }
  
  return new Redis({ url, token });
};

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  category: 'sales' | 'profit' | 'discount' | 'brand' | 'inventory' | 'hr' | 'custom';
  createdAt: string;
  createdBy?: string;
}

// 모든 저장된 쿼리 조회
export async function GET() {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json({
        success: true,
        queries: [],
        fallback: true,
        message: 'Redis가 설정되지 않았습니다.',
      });
    }
    
    const queries = await redis.get<SavedQuery[]>(QUERIES_KEY);
    return NextResponse.json({
      success: true,
      queries: queries || [],
    });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json({
      success: true,
      queries: [],
      fallback: true,
    });
  }
}

// 새 쿼리 저장
export async function POST(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다. Vercel 대시보드에서 환경 변수를 확인해주세요.' },
        { status: 500 }
      );
    }

    const { name, query, category, createdBy } = await request.json();

    if (!name || !query) {
      return NextResponse.json(
        { error: '쿼리 이름과 내용이 필요합니다.' },
        { status: 400 }
      );
    }

    const newQuery: SavedQuery = {
      id: `shared-${Date.now()}`,
      name,
      query,
      category: category || 'custom',
      createdAt: new Date().toISOString(),
      createdBy: createdBy || '익명',
    };

    // 기존 쿼리 조회
    let queries = await redis.get<SavedQuery[]>(QUERIES_KEY) || [];
    
    // 새 쿼리 추가 (최신순)
    queries = [newQuery, ...queries];
    
    // 최대 100개로 제한
    if (queries.length > 100) {
      queries = queries.slice(0, 100);
    }

    await redis.set(QUERIES_KEY, queries);

    return NextResponse.json({
      success: true,
      query: newQuery,
    });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json(
      { error: 'Redis 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 쿼리 삭제
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
        { error: '삭제할 쿼리 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    let queries = await redis.get<SavedQuery[]>(QUERIES_KEY) || [];
    queries = queries.filter((q) => q.id !== id);
    
    await redis.set(QUERIES_KEY, queries);

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
