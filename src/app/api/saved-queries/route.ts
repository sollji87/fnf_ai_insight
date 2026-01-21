import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

const QUERIES_KEY = 'fnf-shared-queries';

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  category: 'sales' | 'profit' | 'discount' | 'brand' | 'custom';
  createdAt: string;
  createdBy?: string;
}

// 모든 저장된 쿼리 조회
export async function GET() {
  try {
    const queries = await kv.get<SavedQuery[]>(QUERIES_KEY);
    return NextResponse.json({
      success: true,
      queries: queries || [],
    });
  } catch (error) {
    // KV가 설정되지 않은 경우 빈 배열 반환
    console.error('KV Error:', error);
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
    let queries = await kv.get<SavedQuery[]>(QUERIES_KEY) || [];
    
    // 새 쿼리 추가 (최신순)
    queries = [newQuery, ...queries];
    
    // 최대 100개로 제한
    if (queries.length > 100) {
      queries = queries.slice(0, 100);
    }

    await kv.set(QUERIES_KEY, queries);

    return NextResponse.json({
      success: true,
      query: newQuery,
    });
  } catch (error) {
    console.error('KV Error:', error);
    return NextResponse.json(
      { error: 'Vercel KV가 설정되지 않았습니다. Vercel 대시보드에서 KV 스토리지를 생성해주세요.' },
      { status: 500 }
    );
  }
}

// 쿼리 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: '삭제할 쿼리 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    let queries = await kv.get<SavedQuery[]>(QUERIES_KEY) || [];
    queries = queries.filter((q) => q.id !== id);
    
    await kv.set(QUERIES_KEY, queries);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('KV Error:', error);
    return NextResponse.json(
      { error: 'Vercel KV가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }
}
