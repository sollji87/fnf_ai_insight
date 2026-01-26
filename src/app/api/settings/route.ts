import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { AVAILABLE_REGIONS, DEFAULT_ACTIVE_REGIONS } from '@/lib/prompts';
import type { RegionId } from '@/types';

const ACTIVE_REGIONS_KEY = 'fnf-active-regions';

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

// 활성화된 국가 목록 조회
export async function GET() {
  try {
    const redis = getRedis();
    
    if (!redis) {
      // Redis가 없으면 기본값 반환
      return NextResponse.json({
        success: true,
        activeRegions: DEFAULT_ACTIVE_REGIONS,
        availableRegions: AVAILABLE_REGIONS,
        fallback: true,
      });
    }
    
    let activeRegions = await redis.get<RegionId[]>(ACTIVE_REGIONS_KEY);
    
    // 저장된 값이 없으면 기본값 사용
    if (!activeRegions || activeRegions.length === 0) {
      activeRegions = DEFAULT_ACTIVE_REGIONS as RegionId[];
      await redis.set(ACTIVE_REGIONS_KEY, activeRegions);
    }
    
    return NextResponse.json({
      success: true,
      activeRegions,
      availableRegions: AVAILABLE_REGIONS,
    });
  } catch (error) {
    console.error('Settings GET Error:', error);
    return NextResponse.json({
      success: true,
      activeRegions: DEFAULT_ACTIVE_REGIONS,
      availableRegions: AVAILABLE_REGIONS,
      fallback: true,
    });
  }
}

// 국가 추가
export async function POST(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { regionId } = await request.json();

    if (!regionId) {
      return NextResponse.json(
        { error: '추가할 국가 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 유효한 국가인지 확인
    const validRegion = AVAILABLE_REGIONS.find(r => r.id === regionId);
    if (!validRegion) {
      return NextResponse.json(
        { error: '유효하지 않은 국가입니다.' },
        { status: 400 }
      );
    }

    // 현재 활성 국가 목록 조회
    let activeRegions = await redis.get<RegionId[]>(ACTIVE_REGIONS_KEY) || DEFAULT_ACTIVE_REGIONS as RegionId[];
    
    // 이미 추가된 국가인지 확인
    if (activeRegions.includes(regionId)) {
      return NextResponse.json(
        { error: '이미 추가된 국가입니다.' },
        { status: 400 }
      );
    }

    // 국가 추가
    activeRegions = [...activeRegions, regionId];
    await redis.set(ACTIVE_REGIONS_KEY, activeRegions);

    return NextResponse.json({
      success: true,
      activeRegions,
      addedRegion: validRegion,
    });
  } catch (error) {
    console.error('Settings POST Error:', error);
    return NextResponse.json(
      { error: '국가 추가 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 국가 삭제
export async function DELETE(request: NextRequest) {
  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { regionId } = await request.json();

    if (!regionId) {
      return NextResponse.json(
        { error: '삭제할 국가 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 기본 국가인지 확인 (기본 국가는 삭제 불가)
    const region = AVAILABLE_REGIONS.find(r => r.id === regionId);
    if (region?.isDefault) {
      return NextResponse.json(
        { error: '기본 국가는 삭제할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 현재 활성 국가 목록에서 삭제
    let activeRegions = await redis.get<RegionId[]>(ACTIVE_REGIONS_KEY) || DEFAULT_ACTIVE_REGIONS as RegionId[];
    activeRegions = activeRegions.filter(id => id !== regionId);
    
    await redis.set(ACTIVE_REGIONS_KEY, activeRegions);

    return NextResponse.json({
      success: true,
      activeRegions,
    });
  } catch (error) {
    console.error('Settings DELETE Error:', error);
    return NextResponse.json(
      { error: '국가 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
