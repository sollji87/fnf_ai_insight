'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sparkles, RotateCcw, ChevronDown, ChevronUp, Zap, Settings, X, Save } from 'lucide-react';
import { SYSTEM_PROMPT, COMMON_GUIDELINES } from '@/lib/prompts';
import type { QueryResult, InsightResponse } from '@/types';

interface PromptEditorProps {
  queryResult: QueryResult | null;
  currentQuery: string;
  onInsightGenerated: (response: InsightResponse) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onGenerateReady?: (generateFn: () => Promise<void>) => void;
  onAnalysisRequestChange?: (request: string) => void;
  externalAnalysisRequest?: string;
}

const COMMON_PROMPT_KEY = 'fnf-common-prompt';
const ANALYSIS_REQUEST_KEY = 'fnf-analysis-request';
const USER_PROMPT_KEY = 'fnf-user-prompt';

const DEFAULT_ANALYSIS_REQUEST = [
  '당월(2026년 2월)과 전년동월(2025년 2월) 차이를 중심으로 원인과 리스크를 분석해줘.',
  '최근 12개월은 2025년 3월~2026년 2월 기준으로 보고, 실행 가능한 액션까지 제시해줘.',
].join('\n');

const DEFAULT_COMMON_PROMPT = `<GUIDELINES>
${COMMON_GUIDELINES}
- 당월: 2026년 2월(202602), 전년 동월: 2025년 2월(202502).
- 최근 12개월: 202503~202602, 직전 12개월: 202403~202502.
- 비용 대비 실판매출/수익성 계산은 ACT_SALE_AMT * 1.1 기준.
- 금액은 *_MIL_KRW(백만원) 우선, 필요 시 *_KRW(원) 병기.
</GUIDELINES>`;

const BRAND_BY_CODE: Record<string, string> = {
  M: 'MLB',
  I: 'MLB KIDS',
  X: 'DISCOVERY',
  V: 'DUVETICA',
  ST: 'SERGIO TACCHINI',
};

function inferBrandNameFromQuery(query: string): string | null {
  if (!query) return null;
  const upper = query.toUpperCase();

  const codeMatch = query.match(/brd_cd\s*=\s*'([A-Z]{1,2})'/i);
  if (codeMatch) {
    const code = codeMatch[1].toUpperCase();
    return BRAND_BY_CODE[code] || null;
  }

  const inMatch = query.match(/brd_cd\s+in\s*\(([^)]+)\)/i);
  if (inMatch) {
    const firstCode = (inMatch[1].match(/'([A-Z]{1,2})'/i) || [])[1];
    if (firstCode) {
      const code = firstCode.toUpperCase();
      return BRAND_BY_CODE[code] || null;
    }
  }

  if (/MLB\s*KIDS|MLB\s*KDS|MLB\s*KDIS/.test(upper)) return 'MLB KIDS';
  if (/SERGIO\s*TACCHINI/.test(upper)) return 'SERGIO TACCHINI';
  if (/DUVETICA/.test(upper)) return 'DUVETICA';
  if (/DISCOVERY/.test(upper)) return 'DISCOVERY';
  if (/\bMLB\b/.test(upper)) return 'MLB';

  return null;
}

export function PromptEditor({
  queryResult,
  currentQuery,
  onInsightGenerated,
  isLoading,
  setIsLoading,
  onGenerateReady,
  onAnalysisRequestChange,
  externalAnalysisRequest,
}: PromptEditorProps) {
  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT);
  const [userPrompt, setUserPrompt] = useState('');
  const [commonPrompt, setCommonPrompt] = useState(DEFAULT_COMMON_PROMPT);
  const [analysisRequest, setAnalysisRequest] = useState(DEFAULT_ANALYSIS_REQUEST);
  const [error, setError] = useState<string | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showCommonPromptEditor, setShowCommonPromptEditor] = useState(false);
  const [tempCommonPrompt, setTempCommonPrompt] = useState('');

  const onAnalysisRequestChangeRef = useRef(onAnalysisRequestChange);
  const onGenerateReadyRef = useRef(onGenerateReady);

  useEffect(() => {
    onAnalysisRequestChangeRef.current = onAnalysisRequestChange;
  }, [onAnalysisRequestChange]);

  useEffect(() => {
    onGenerateReadyRef.current = onGenerateReady;
  }, [onGenerateReady]);

  useEffect(() => {
    const storedCommonPrompt = localStorage.getItem(COMMON_PROMPT_KEY);
    if (storedCommonPrompt) {
      setCommonPrompt(storedCommonPrompt);
    }

    const storedAnalysisRequest = localStorage.getItem(ANALYSIS_REQUEST_KEY);
    if (storedAnalysisRequest) {
      setAnalysisRequest(storedAnalysisRequest);
    }

    const storedUserPrompt = localStorage.getItem(USER_PROMPT_KEY);
    if (storedUserPrompt) {
      setUserPrompt(storedUserPrompt);
    }
  }, []);

  useEffect(() => {
    if (externalAnalysisRequest && externalAnalysisRequest.trim()) {
      setAnalysisRequest(externalAnalysisRequest);
    }
  }, [externalAnalysisRequest]);

  useEffect(() => {
    localStorage.setItem(ANALYSIS_REQUEST_KEY, analysisRequest);
    if (onAnalysisRequestChangeRef.current) {
      onAnalysisRequestChangeRef.current(analysisRequest);
    }
  }, [analysisRequest]);

  useEffect(() => {
    localStorage.setItem(USER_PROMPT_KEY, userPrompt);
  }, [userPrompt]);

  const openCommonPromptEditor = () => {
    setTempCommonPrompt(commonPrompt);
    setShowCommonPromptEditor(true);
  };

  const saveCommonPrompt = () => {
    setCommonPrompt(tempCommonPrompt);
    localStorage.setItem(COMMON_PROMPT_KEY, tempCommonPrompt);
    setShowCommonPromptEditor(false);
  };

  const resetCommonPrompt = () => {
    setTempCommonPrompt(DEFAULT_COMMON_PROMPT);
  };

  const resetAll = () => {
    setSystemPrompt(SYSTEM_PROMPT);
    setUserPrompt('');
    setAnalysisRequest(DEFAULT_ANALYSIS_REQUEST);
    localStorage.removeItem(ANALYSIS_REQUEST_KEY);
    localStorage.removeItem(USER_PROMPT_KEY);
  };

  const generateInsight = useCallback(async () => {
    if (!queryResult) {
      setError('먼저 SQL 쿼리를 실행해 주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const inferredBrandName = inferBrandNameFromQuery(currentQuery);

      const finalUserPrompt = `Analyze the dataset and write a Korean executive insight report.

<DATA>
{{DATA}}
</DATA>

<ANALYSIS_REQUEST>
${analysisRequest}
</ANALYSIS_REQUEST>

${userPrompt ? `<ADDITIONAL_REQUEST>\n${userPrompt}\n</ADDITIONAL_REQUEST>\n\n` : ''}${commonPrompt}`;

      const response = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: currentQuery,
          systemPrompt,
          userPrompt: finalUserPrompt,
          analysisRequest,
          brandName: inferredBrandName || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '인사이트 생성에 실패했습니다.');
      }

      onInsightGenerated({
        insight: data.insight,
        tokensUsed: data.tokensUsed,
        responseTime: data.responseTime,
        model: data.model,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [queryResult, currentQuery, systemPrompt, userPrompt, commonPrompt, analysisRequest, setIsLoading, onInsightGenerated]);

  useEffect(() => {
    if (onGenerateReadyRef.current) {
      onGenerateReadyRef.current(generateInsight);
    }
  }, [generateInsight]);

  return (
    <div className="flex flex-col h-full rounded-xl bg-white border border-gray-200 overflow-hidden card-shadow relative">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">프롬프트 에디터</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={openCommonPromptEditor}
            className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
          >
            <Settings className="w-3.5 h-3.5 mr-1" />
            공통 프롬프트
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetAll}
            className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            초기화
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <button
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            {showSystemPrompt ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            시스템 프롬프트 {showSystemPrompt ? '숨기기' : '보기'}
          </button>
          {showSystemPrompt && (
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="mt-2 min-h-[120px] bg-gray-50 border-gray-200 text-gray-900 text-sm resize-none"
              placeholder="시스템 프롬프트를 입력하세요."
            />
          )}
        </div>

        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
            <Zap className="w-3.5 h-3.5 inline mr-1 text-amber-500" />
            분석 요청사항
          </Label>
          <Textarea
            value={analysisRequest}
            onChange={(e) => setAnalysisRequest(e.target.value)}
            className="min-h-[220px] bg-white border-gray-200 text-gray-900 resize-none text-sm"
            placeholder="분석 요청사항을 입력하세요."
          />
        </div>

        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
            추가 요청사항 (선택)
          </Label>
          <Textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            className="min-h-[80px] bg-white border-gray-200 text-gray-900 text-sm resize-none"
            placeholder="추가 지시사항이 있으면 입력하세요."
          />
        </div>

        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">공통 적용 프롬프트</span>
            <button
              onClick={openCommonPromptEditor}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              수정
            </button>
          </div>
          <p className="text-xs text-gray-500 line-clamp-2">
            {commonPrompt.substring(0, 120)}...
          </p>
        </div>

        {queryResult ? (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <p className="text-emerald-700 text-sm flex items-center">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2" />
              쿼리 결과 준비됨: {queryResult.rowCount}행, {queryResult.columns.length}컬럼
              <span className="text-emerald-600 ml-2">({queryResult.executionTime}ms)</span>
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-gray-500 text-sm">SQL 쿼리를 실행하면 결과가 연결됩니다.</p>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-red-600 text-sm">
          {error}
        </div>
      )}

      {showCommonPromptEditor && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-5 w-[520px] max-h-[620px] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">공통 적용 프롬프트</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  모든 인사이트 생성 시 자동으로 붙는 공통 지침입니다.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCommonPromptEditor(false)}
                className="text-gray-400 hover:text-gray-600 h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <Textarea
              value={tempCommonPrompt}
              onChange={(e) => setTempCommonPrompt(e.target.value)}
              className="flex-1 min-h-[320px] bg-gray-50 border-gray-200 text-gray-900 text-sm resize-none mb-4"
              placeholder="공통 프롬프트를 입력하세요."
            />

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetCommonPrompt}
                className="text-gray-500 hover:text-gray-900"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                기본값 복원
              </Button>
              <Button
                onClick={saveCommonPrompt}
                className="bg-gray-900 hover:bg-gray-800 text-white"
                disabled={isLoading}
              >
                <Save className="w-4 h-4 mr-2" />
                저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
