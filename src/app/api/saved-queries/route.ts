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

type Region = 'domestic' | 'china';
type BrandCode = 'M' | 'I' | 'X' | 'V' | 'ST';

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  category: 'sales' | 'profit' | 'discount' | 'brand' | 'inventory' | 'hr' | 'custom';
  region: Region;
  brand?: BrandCode;
  createdAt: string;
  createdBy?: string;
}

// 브랜드 코드별 이름 매핑
const BRAND_NAMES: Record<BrandCode, string> = {
  M: 'MLB',
  I: 'MLB KIDS',
  X: 'DISCOVERY',
  V: 'DUVETICA',
  ST: 'SERGIO TACCHINI',
};

// SQL 쿼리에서 브랜드 코드를 치환하는 함수
const replaceBrandCodeInQuery = (queryStr: string, sourceBrand: BrandCode, targetBrand: BrandCode): string => {
  // brd_cd = 'M' 형태의 패턴을 치환 (대소문자 무시, 공백 유연 처리)
  // 지원 패턴: brd_cd = 'M', brd_cd='M', BRD_CD = 'M', brd_cd IN ('M'), brd_cd in ('M', 'X')
  let result = queryStr;
  
  // 단일 값 비교: brd_cd = 'M' or brd_cd = 'M'
  const singlePattern = new RegExp(
    `(brd_cd\\s*=\\s*')${escapeRegex(sourceBrand)}(')`,
    'gi'
  );
  result = result.replace(singlePattern, `$1${targetBrand}$2`);

  // IN 절 내부: 'M' 을 'I'로 (brd_cd IN (...) 내부)
  // 개별 값만 치환 (IN 절의 각 값에 대해)
  const inValuePattern = new RegExp(
    `'${escapeRegex(sourceBrand)}'`,
    'g'
  );
  result = result.replace(inValuePattern, `'${targetBrand}'`);
  
  return result;
};

// 정규식 특수문자 이스케이프
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// SQL 쿼리에서 날짜 문자열을 치환하는 함수
const replaceDatesInQuery = (
  queryStr: string,
  dateReplacements: Array<{ from: string; to: string }>
): string => {
  let result = queryStr;
  for (const { from, to } of dateReplacements) {
    if (from && to) {
      result = result.split(from).join(to);
    }
  }
  return result;
};

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
    
    let queries = await redis.get<SavedQuery[]>(QUERIES_KEY) || [];
    
    // 기존 쿼리에 region이 없으면 'domestic'으로 마이그레이션
    let needsMigration = false;
    queries = queries.map(q => {
      if (!q.region) {
        needsMigration = true;
        return { ...q, region: 'domestic' as Region };
      }
      return q;
    });
    
    // 마이그레이션이 필요하면 저장
    if (needsMigration) {
      await redis.set(QUERIES_KEY, queries);
    }
    
    return NextResponse.json({
      success: true,
      queries,
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

    const { name, query, category, createdBy, region, brand } = await request.json();

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
      region: region || 'domestic',
      brand: brand || undefined,
      createdAt: new Date().toISOString(),
      createdBy: createdBy || '익명',
    };

    // 기존 쿼리 조회
    let queries = await redis.get<SavedQuery[]>(QUERIES_KEY) || [];
    
    // 새 쿼리 추가 (최신순)
    queries = [newQuery, ...queries];
    
    // 최대 500개로 제한 (브랜드별 복사로 쿼리 수 증가 대비)
    if (queries.length > 500) {
      queries = queries.slice(0, 500);
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

// 일괄 복사 / 날짜 변경 (Batch Operations)
export async function PUT(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { action, sourceBrand, targetBrands, dateReplacements, region } = await request.json();

    let queries = await redis.get<SavedQuery[]>(QUERIES_KEY) || [];

    if (action === 'bulk-copy') {
      // 소스 브랜드의 쿼리 필터링 (region도 고려)
      const sourceQueries = queries.filter(q => {
        const matchesBrand = q.brand === sourceBrand || (!q.brand && sourceBrand === 'M');
        const matchesRegion = !region || q.region === region || !q.region;
        return matchesBrand && matchesRegion;
      });

      if (sourceQueries.length === 0) {
        return NextResponse.json(
          { error: `${BRAND_NAMES[sourceBrand as BrandCode] || sourceBrand} 브랜드의 쿼리가 없습니다.` },
          { status: 400 }
        );
      }

      const newQueries: SavedQuery[] = [];

      for (const targetBrand of (targetBrands as BrandCode[])) {
        // 이미 해당 브랜드의 쿼리가 있는지 확인 (중복 방지)
        const existingTargetNames = queries
          .filter(q => q.brand === targetBrand)
          .map(q => q.name);

        for (const sourceQuery of sourceQueries) {
          // 동일 이름이 이미 있으면 건너뛰기
          const targetName = `${sourceQuery.name}`;
          if (existingTargetNames.includes(targetName)) continue;

          // SQL 쿼리에서 브랜드 코드 치환
          let modifiedQuery = replaceBrandCodeInQuery(
            sourceQuery.query,
            sourceBrand as BrandCode,
            targetBrand
          );

          // 날짜 치환 (제공된 경우)
          if (dateReplacements && dateReplacements.length > 0) {
            modifiedQuery = replaceDatesInQuery(modifiedQuery, dateReplacements);
          }

          newQueries.push({
            id: `shared-${Date.now()}-${targetBrand}-${Math.random().toString(36).substring(2, 7)}`,
            name: targetName,
            query: modifiedQuery,
            category: sourceQuery.category,
            region: sourceQuery.region,
            brand: targetBrand,
            createdAt: new Date().toISOString(),
            createdBy: sourceQuery.createdBy || '일괄복사',
          });
        }
      }

      // 새 쿼리를 앞에 추가
      queries = [...newQueries, ...queries];

      // 최대 500개로 제한
      if (queries.length > 500) {
        queries = queries.slice(0, 500);
      }

      await redis.set(QUERIES_KEY, queries);

      return NextResponse.json({
        success: true,
        copiedCount: newQueries.length,
        message: `${newQueries.length}개의 쿼리가 복사되었습니다.`,
      });
    }

    if (action === 'bulk-update-dates') {
      // 특정 브랜드(또는 전체)의 쿼리에서 날짜 일괄 변경
      const targetBrand = (await request.json()).targetBrand;
      let updatedCount = 0;

      queries = queries.map(q => {
        const matchesBrand = !targetBrand || q.brand === targetBrand || (!q.brand && targetBrand === 'M');
        const matchesRegion = !region || q.region === region || !q.region;
        
        if (matchesBrand && matchesRegion && dateReplacements && dateReplacements.length > 0) {
          const modifiedQuery = replaceDatesInQuery(q.query, dateReplacements);
          if (modifiedQuery !== q.query) {
            updatedCount++;
            return { ...q, query: modifiedQuery };
          }
        }
        return q;
      });

      await redis.set(QUERIES_KEY, queries);

      return NextResponse.json({
        success: true,
        updatedCount,
        message: `${updatedCount}개의 쿼리가 업데이트되었습니다.`,
      });
    }

    if (action === 'set-brand') {
      // 기존 쿼리에 브랜드 코드 일괄 설정 (마이그레이션용)
      const brand = sourceBrand as BrandCode;
      let updatedCount = 0;

      queries = queries.map(q => {
        if (!q.brand) {
          updatedCount++;
          return { ...q, brand };
        }
        return q;
      });

      await redis.set(QUERIES_KEY, queries);

      return NextResponse.json({
        success: true,
        updatedCount,
        message: `${updatedCount}개의 쿼리에 브랜드 ${BRAND_NAMES[brand]}가 설정되었습니다.`,
      });
    }

    return NextResponse.json(
      { error: '유효하지 않은 action입니다.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json(
      { error: '일괄 작업 중 오류가 발생했습니다.' },
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
