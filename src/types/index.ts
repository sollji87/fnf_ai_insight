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

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  category: 'sales' | 'profit' | 'discount' | 'brand' | 'inventory' | 'hr' | 'custom';
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
  createdAt: string;
  createdBy?: string;
}
