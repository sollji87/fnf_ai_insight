export interface SnowflakeConfig {
  account: string;
  username: string;
  password: string;
  database: string;
  schema: string;
  warehouse: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

export interface InsightRequest {
  query: string;
  systemPrompt: string;
  userPrompt: string;
  brandName?: string;
}

export interface InsightResponse {
  insight: string;
  tokensUsed: number;
  responseTime: number;
  model: string;
}

export interface BrandInsight {
  brandName: string;
  insight: string;
  data: QueryResult | null;
}

export interface QueryTemplate {
  id: string;
  name: string;
  description: string;
  query: string;
  category: 'sales' | 'profit' | 'discount' | 'brand' | 'inventory' | 'hr' | 'custom';
  createdAt: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
}

// 지원하는 국가/지역 ID
export type RegionId = 'domestic' | 'china' | 'hmt' | 'usa';

// 기존 호환성을 위한 Region 타입 (RegionId의 별칭)
export type Region = RegionId;

// 국가/지역 설정 인터페이스
export interface RegionConfig {
  id: RegionId;
  name: string;
  emoji: string;
  isDefault: boolean; // 기본 국가 여부 (삭제 불가)
}

// 브랜드 코드 타입
export type BrandCode = 'M' | 'I' | 'X' | 'V' | 'ST';

// 브랜드 설정 인터페이스
export interface BrandConfig {
  code: BrandCode;
  name: string;
}

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  category: 'sales' | 'profit' | 'discount' | 'brand' | 'inventory' | 'hr' | 'custom';
  region: Region;
  brand?: BrandCode;
  createdAt: string;
  createdBy?: string;
}

export interface SavedInsight {
  id: string;
  title: string;
  brandName?: string;
  insight: string;
  query?: string;
  analysisRequest?: string;
  tokensUsed: number;
  model: string;
  region?: RegionId; // 국가/지역 (없으면 'domestic'으로 간주)
  yearMonth?: string; // 연월 (YYYYMM 형식, 예: '202512')
  createdAt: string;
  createdBy?: string;
  deletedAt?: string; // 휴지통으로 이동된 시각 (소프트 삭제)
}
