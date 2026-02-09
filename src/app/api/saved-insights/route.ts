import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import type { RegionId } from '@/types';

const INSIGHTS_KEY = 'fnf-shared-insights';
const TRASH_KEY = 'fnf-shared-insights-trash';
const TRASH_RETENTION_DAYS = 30;

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
  deletedAt?: string; // 휴지통 이동 시각
}

// 30일 지난 휴지통 항목 자동 정리
const cleanupOldTrashItems = async (redis: Redis) => {
  const trashItems = await redis.get<SavedInsight[]>(TRASH_KEY) || [];
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const filtered = trashItems.filter((item) => {
    if (!item.deletedAt) return false;
    return new Date(item.deletedAt).getTime() > cutoff;
  });

  if (filtered.length !== trashItems.length) {
    await redis.set(TRASH_KEY, filtered);
  }

  return filtered;
};

// 모든 저장된 인사이트 조회 (trash=true 시 휴지통 조회)
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const isTrash = searchParams.get('trash') === 'true';

    if (isTrash) {
      // 휴지통 조회 (30일 지난 항목 자동 정리)
      const trashItems = await cleanupOldTrashItems(redis);
      return NextResponse.json({
        success: true,
        insights: trashItems,
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

// 브랜드 코드 매핑
const BRAND_MAP: Record<string, { code: string; name: string }> = {
  M: { code: 'M', name: 'MLB' },
  I: { code: 'I', name: 'MLB KIDS' },
  X: { code: 'X', name: 'DISCOVERY' },
  V: { code: 'V', name: 'DUVETICA' },
  ST: { code: 'ST', name: 'SERGIO TACCHINI' },
};

// 정규식 특수문자 이스케이프
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// 텍스트 내 브랜드명 치환
const replaceBrandName = (text: string, sourceName: string, targetName: string): string => {
  if (!text) return text;
  const pattern = new RegExp(escapeRegex(sourceName), 'gi');
  return text.replace(pattern, targetName);
};

// SQL 쿼리 내 brd_cd 치환
const replaceBrandCode = (queryStr: string, sourceCode: string, targetCode: string): string => {
  if (!queryStr) return queryStr;
  // brd_cd = 'M' 패턴 치환
  const singlePattern = new RegExp(
    `(brd_cd\\s*=\\s*')${escapeRegex(sourceCode)}(')`,
    'gi'
  );
  let result = queryStr.replace(singlePattern, `$1${targetCode}$2`);
  // IN 절 내 값 치환
  const inValuePattern = new RegExp(`'${escapeRegex(sourceCode)}'`, 'g');
  result = result.replace(inValuePattern, `'${targetCode}'`);
  return result;
};

// 인사이트 브랜드별 일괄 복사
export async function PUT(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { action, sourceBrand, targetBrands, insightIds, dateReplacements } = await request.json();

    if (action !== 'bulk-copy') {
      return NextResponse.json(
        { error: '유효하지 않은 action입니다.' },
        { status: 400 }
      );
    }

    if (!sourceBrand || !targetBrands || targetBrands.length === 0) {
      return NextResponse.json(
        { error: '소스 브랜드와 대상 브랜드를 지정해주세요.' },
        { status: 400 }
      );
    }

    const sourceBrandInfo = BRAND_MAP[sourceBrand];
    if (!sourceBrandInfo) {
      return NextResponse.json(
        { error: '유효하지 않은 소스 브랜드 코드입니다.' },
        { status: 400 }
      );
    }

    let insights = await redis.get<SavedInsight[]>(INSIGHTS_KEY) || [];

    // 복사 대상 인사이트 필터링
    const sourceInsights = insightIds && insightIds.length > 0
      ? insights.filter(i => insightIds.includes(i.id))
      : insights.filter(i => {
          const name = (i.brandName || '').toUpperCase();
          return name.includes(sourceBrandInfo.name.toUpperCase());
        });

    if (sourceInsights.length === 0) {
      return NextResponse.json(
        { error: `${sourceBrandInfo.name} 브랜드의 인사이트가 없습니다.` },
        { status: 400 }
      );
    }

    const newInsights: SavedInsight[] = [];

    for (const targetCode of targetBrands as string[]) {
      const targetBrandInfo = BRAND_MAP[targetCode];
      if (!targetBrandInfo) continue;

      // 이미 해당 브랜드로 복사된 것이 있는지 중복 체크
      const existingTitles = insights
        .filter(i => (i.brandName || '').toUpperCase().includes(targetBrandInfo.name.toUpperCase()))
        .map(i => i.title);

      for (const source of sourceInsights) {
        // 제목에서 브랜드명 치환
        const newTitle = replaceBrandName(source.title, sourceBrandInfo.name, targetBrandInfo.name);
        
        // 동일 제목 중복 체크
        if (existingTitles.includes(newTitle)) continue;

        // 분석 요청 프롬프트에서 브랜드명 치환
        const newAnalysisRequest = replaceBrandName(
          source.analysisRequest || '',
          sourceBrandInfo.name,
          targetBrandInfo.name
        );

        // SQL 쿼리에서 브랜드 코드 + 브랜드명 치환
        let newQuery = source.query || '';
        if (newQuery) {
          newQuery = replaceBrandCode(newQuery, sourceBrandInfo.code, targetBrandInfo.code);
          newQuery = replaceBrandName(newQuery, sourceBrandInfo.name, targetBrandInfo.name);
        }

        // 날짜 치환 (제공된 경우)
        if (dateReplacements && dateReplacements.length > 0) {
          for (const { from, to } of dateReplacements) {
            if (from && to) {
              if (newQuery) newQuery = newQuery.split(from).join(to);
              // analysisRequest에도 날짜 치환 적용
            }
          }
        }

        newInsights.push({
          id: `insight-${Date.now()}-${targetCode}-${Math.random().toString(36).substring(2, 7)}`,
          title: newTitle,
          brandName: targetBrandInfo.name,
          insight: `[${targetBrandInfo.name}용으로 복사됨 - 재생성 필요]\n\n` +
            replaceBrandName(source.insight || '', sourceBrandInfo.name, targetBrandInfo.name),
          query: newQuery || undefined,
          analysisRequest: newAnalysisRequest || undefined,
          tokensUsed: 0,
          model: source.model || 'copied',
          region: source.region || 'domestic',
          createdAt: new Date().toISOString(),
          createdBy: `일괄복사 (${sourceBrandInfo.name} → ${targetBrandInfo.name})`,
        });
      }
    }

    if (newInsights.length === 0) {
      return NextResponse.json({
        success: true,
        copiedCount: 0,
        message: '복사할 새로운 인사이트가 없습니다. (이미 복사된 항목이거나 대상이 없습니다)',
      });
    }

    // 새 인사이트를 앞에 추가
    insights = [...newInsights, ...insights];

    // 최대 200개로 제한
    if (insights.length > 200) {
      insights = insights.slice(0, 200);
    }

    await redis.set(INSIGHTS_KEY, insights);

    return NextResponse.json({
      success: true,
      copiedCount: newInsights.length,
      message: `${newInsights.length}개의 인사이트(프롬프트)가 복사되었습니다.`,
    });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json(
      { error: '일괄 복사 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 인사이트 업데이트 (insight 본문, analysisRequest, title 등 부분 업데이트 지원)
export async function PATCH(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { id, insight, analysisRequest, title, query, brandName } = body;

    if (!id) {
      return NextResponse.json(
        { error: '인사이트 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 최소 하나의 업데이트 필드가 있어야 함
    if (!insight && analysisRequest === undefined && !title && !query && !brandName) {
      return NextResponse.json(
        { error: '업데이트할 필드가 필요합니다. (insight, analysisRequest, title, query, brandName 중 하나 이상)' },
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

    // 제공된 필드만 업데이트
    const updates: Partial<SavedInsight> = {};
    if (insight !== undefined) updates.insight = insight;
    if (analysisRequest !== undefined) updates.analysisRequest = analysisRequest;
    if (title !== undefined) updates.title = title;
    if (query !== undefined) updates.query = query;
    if (brandName !== undefined) updates.brandName = brandName;

    insights[insightIndex] = {
      ...insights[insightIndex],
      ...updates,
    };
    
    await redis.set(INSIGHTS_KEY, insights);

    return NextResponse.json({
      success: true,
      insight: insights[insightIndex],
      updatedFields: Object.keys(updates),
    });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json(
      { error: 'Redis 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 인사이트 삭제 (소프트 삭제 / 복원 / 영구 삭제)
export async function DELETE(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { id, permanent, restore } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: '인사이트 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 복원: 휴지통 → 인사이트 목록으로 이동
    if (restore) {
      let trashItems = await redis.get<SavedInsight[]>(TRASH_KEY) || [];
      const itemToRestore = trashItems.find((i) => i.id === id);

      if (!itemToRestore) {
        return NextResponse.json(
          { error: '휴지통에서 해당 인사이트를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // 휴지통에서 제거
      trashItems = trashItems.filter((i) => i.id !== id);
      await redis.set(TRASH_KEY, trashItems);

      // deletedAt 필드 제거 후 인사이트 목록에 추가
      const { deletedAt: _, ...restoredInsight } = itemToRestore;
      let insights = await redis.get<SavedInsight[]>(INSIGHTS_KEY) || [];
      insights = [restoredInsight as SavedInsight, ...insights];
      await redis.set(INSIGHTS_KEY, insights);

      return NextResponse.json({ success: true, restored: true });
    }

    // 영구 삭제: 휴지통에서 완전히 제거
    if (permanent) {
      let trashItems = await redis.get<SavedInsight[]>(TRASH_KEY) || [];
      trashItems = trashItems.filter((i) => i.id !== id);
      await redis.set(TRASH_KEY, trashItems);

      return NextResponse.json({ success: true, permanentlyDeleted: true });
    }

    // 소프트 삭제: 인사이트 → 휴지통으로 이동
    let insights = await redis.get<SavedInsight[]>(INSIGHTS_KEY) || [];
    const itemToTrash = insights.find((i) => i.id === id);

    if (!itemToTrash) {
      return NextResponse.json(
        { error: '해당 인사이트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 인사이트 목록에서 제거
    insights = insights.filter((i) => i.id !== id);
    await redis.set(INSIGHTS_KEY, insights);

    // 휴지통에 추가 (deletedAt 기록)
    let trashItems = await redis.get<SavedInsight[]>(TRASH_KEY) || [];
    trashItems = [{ ...itemToTrash, deletedAt: new Date().toISOString() }, ...trashItems];

    // 휴지통 최대 100개 제한
    if (trashItems.length > 100) {
      trashItems = trashItems.slice(0, 100);
    }

    await redis.set(TRASH_KEY, trashItems);

    return NextResponse.json({ success: true, trashedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json(
      { error: 'Redis 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
