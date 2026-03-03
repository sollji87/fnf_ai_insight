import type { BrandConfig, RegionConfig } from '@/types';

export const SYSTEM_PROMPT = `You are a senior business analyst for F&F.

Hard rules:
- Respond in Korean and markdown only.
- Use only provided data; do not invent numbers.
- Keep output concise and executive-ready.
- Monetary priority: *_MIL_KRW (million KRW) > *_KRW.
- Profitability vs actual sales must use ACT_SALE_AMT * 1.1 basis.
- Period baseline:
  - Current month: February 2026 (202602)
  - YoY month: February 2025 (202502)
  - Latest 12M: 202503~202602
  - Prior 12M: 202403~202502

Output:
1) Executive Summary
2) Key Metrics and Drivers
3) Risks / Anomalies
4) Action Plan
5) Data Caveats (if needed)`;

export const COMMON_GUIDELINES = `- One bullet = one idea.
- Show numbers first, interpretation second.
- Percentages: one decimal place.
- Always label current period vs baseline period.
- Avoid repeating the same metric across sections.
- If data is insufficient, state it clearly and propose one follow-up query.`;

export const DEFAULT_USER_PROMPT_TEMPLATE = `Analyze the dataset and write a Korean executive insight report.

<DATA>
{{DATA}}
</DATA>

<ANALYSIS_REQUEST>
{{ANALYSIS_REQUEST}}
</ANALYSIS_REQUEST>

<GUIDELINES>
${COMMON_GUIDELINES}
</GUIDELINES>`;

export const SAMPLE_QUERY_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  query: string;
  category: 'sales' | 'profit' | 'discount' | 'brand' | 'custom';
}> = [];

export const SAMPLE_BRANDS = [
  'MLB',
  'MLB KIDS',
  'DISCOVERY',
  'DUVETICA',
  'SERGIO TACCHINI',
  'SUPRA',
];

export const BRAND_CODES: BrandConfig[] = [
  { code: 'M', name: 'MLB' },
  { code: 'I', name: 'MLB KIDS' },
  { code: 'X', name: 'DISCOVERY' },
  { code: 'V', name: 'DUVETICA' },
  { code: 'ST', name: 'SERGIO TACCHINI' },
];

export interface BrandPromptProfile {
  code: 'M' | 'I' | 'X' | 'V' | 'ST';
  name: string;
  focus: string[];
}

export const BRAND_PROMPT_PROFILES: Record<BrandPromptProfile['code'], BrandPromptProfile> = {
  M: {
    code: 'M',
    name: 'MLB',
    focus: [
      '채널별 성장 대비 이익률(직접이익률/영업이익률) 동행 여부를 우선 점검한다.',
      '대형 채널/체인에서 할인 확대가 이익 훼손으로 이어지는지 확인한다.',
      '매출 규모가 큰 SKU/매장 위주로 실행 우선순위를 제시한다.',
    ],
  },
  I: {
    code: 'I',
    name: 'MLB KIDS',
    focus: [
      '사이즈/재고주수 관점에서 저회전 SKU와 할인 의존 SKU를 분리한다.',
      '아동 라인 특성상 시즌 전환/학사 시즌 영향 구간의 재고 리스크를 점검한다.',
      '소량 SKU 과대해석을 피하고, 매출 기여 상위 SKU 중심으로 판단한다.',
    ],
  },
  X: {
    code: 'X',
    name: 'DISCOVERY',
    focus: [
      '아웃도어/시즌성 품목의 할인-소진 구조와 수익성 균형을 점검한다.',
      '아울렛/오프프라이스 채널 의존이 본채널 이익률에 미치는 영향을 본다.',
      '시즌 말 재고 압력으로 인한 마크다운 리스크를 분리해 제시한다.',
    ],
  },
  V: {
    code: 'V',
    name: 'DUVETICA',
    focus: [
      '고단가 저물량 구조에서 ASP 방어와 할인 통제의 균형을 우선 평가한다.',
      '소수 핵심 SKU/채널 성과가 전체 손익에 미치는 집중도를 확인한다.',
      '재고 에이징과 시즌 마감 할인 확대 가능성을 리스크로 분리한다.',
    ],
  },
  ST: {
    code: 'ST',
    name: 'SERGIO TACCHINI',
    focus: [
      '채널 확장 단계에서 매출 성장과 수익성 확보가 동시에 달성되는지 확인한다.',
      '프로모션 의존 성장인지 구조적 성장인지를 이익률/할인율로 구분한다.',
      '확대 가능 채널과 정리 필요 채널을 명확히 나눠 실행 과제를 제시한다.',
    ],
  },
};

export function normalizeBrandCode(brandName?: string | null): BrandPromptProfile['code'] | null {
  if (!brandName) return null;
  const raw = brandName.trim().toUpperCase();
  if (!raw) return null;

  if (['M', 'MLB'].includes(raw)) return 'M';
  if (['I', 'MK', 'MLB KIDS', 'MLB KDS', 'MLB KDIS'].includes(raw)) return 'I';
  if (['X', 'DX', 'DISCOVERY'].includes(raw)) return 'X';
  if (['V', 'DV', 'DUVETICA'].includes(raw)) return 'V';
  if (['ST', 'SERGIO TACCHINI', 'SERGIO_T', 'SERGIOTACCHINI'].includes(raw)) return 'ST';
  return null;
}

export function getBrandPolicyPrompt(brandName?: string | null): string {
  const code = normalizeBrandCode(brandName);
  if (!code) return '';

  const profile = BRAND_PROMPT_PROFILES[code];
  return `
<Brand Policy>
- Brand: ${profile.name} (${profile.code})
${profile.focus.map((line) => `- ${line}`).join('\n')}
</Brand Policy>
`.trim();
}

export const AVAILABLE_REGIONS: RegionConfig[] = [
  { id: 'domestic', name: '국내', emoji: '🇰🇷', isDefault: true },
  { id: 'china', name: '중국', emoji: '🇨🇳', isDefault: true },
  { id: 'hmt', name: '홍콩/마카오/대만', emoji: '🇭🇰', isDefault: false },
  { id: 'usa', name: '미국', emoji: '🇺🇸', isDefault: false },
];

export const DEFAULT_ACTIVE_REGIONS: string[] = ['domestic', 'china'];
