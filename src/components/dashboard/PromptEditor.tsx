'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, RotateCcw, ChevronDown, ChevronUp, Zap, Settings, X, Save } from 'lucide-react';
import { SYSTEM_PROMPT, COMMON_GUIDELINES } from '@/lib/prompts';
import type { QueryResult, InsightResponse } from '@/types';

interface PromptEditorProps {
  queryResult: QueryResult | null;
  currentQuery: string;
  onInsightGenerated: (response: InsightResponse) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onGenerateReady?: (generateFn: () => Promise<void>) => void;
}

const COMMON_PROMPT_KEY = 'fnf-common-prompt';

const DEFAULT_COMMON_PROMPT = `<작성 가이드라인>
${COMMON_GUIDELINES}
</작성 가이드라인>

위 데이터를 기반으로 다음 내용을 포함하여 마크다운 형식으로 분석해주세요:
1. 핵심 요약 (3줄 이내)
2. 주요 지표 분석
3. 이상징후 및 특이사항
4. 액션 플랜 제안`;

export function PromptEditor({
  queryResult,
  currentQuery,
  onInsightGenerated,
  isLoading,
  setIsLoading,
  onGenerateReady,
}: PromptEditorProps) {
  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT);
  const [userPrompt, setUserPrompt] = useState('');
  const [commonPrompt, setCommonPrompt] = useState(DEFAULT_COMMON_PROMPT);
  const [analysisRequest, setAnalysisRequest] = useState('전반적인 경영 현황을 분석해주세요.');
  const [error, setError] = useState<string | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showCommonPromptEditor, setShowCommonPromptEditor] = useState(false);
  const [tempCommonPrompt, setTempCommonPrompt] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(COMMON_PROMPT_KEY);
    if (stored) {
      setCommonPrompt(stored);
    }
  }, []);

  // Expose generateInsight function to parent
  useEffect(() => {
    if (onGenerateReady) {
      onGenerateReady(generateInsight);
    }
  }, [onGenerateReady, queryResult, systemPrompt, userPrompt, commonPrompt, analysisRequest]);

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
    setAnalysisRequest('전반적인 경영 현황을 분석해주세요.');
  };

  const generateInsight = async () => {
    if (!queryResult) {
      setError('먼저 SQL 쿼리를 실행해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const finalUserPrompt = `아래 데이터를 분석하여 경영 인사이트를 도출해주세요.

<데이터>
{{DATA}}
</데이터>

<분석 요청>
${analysisRequest}
</분석 요청>

${userPrompt ? `<추가 요청사항>\n${userPrompt}\n</추가 요청사항>\n\n` : ''}${commonPrompt}`;

      const response = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: currentQuery,
          systemPrompt,
          userPrompt: finalUserPrompt,
          analysisRequest,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '인사이트 생성 실패');
      }

      onInsightGenerated({
        insight: data.insight,
        tokensUsed: data.tokensUsed,
        responseTime: data.responseTime,
        model: data.model,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl bg-white border border-gray-200 overflow-hidden card-shadow relative">
      {/* Header */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* System Prompt Toggle */}
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
              placeholder="시스템 프롬프트를 입력하세요..."
            />
          )}
        </div>

        {/* Analysis Request */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
            <Zap className="w-3.5 h-3.5 inline mr-1 text-amber-500" />
            분석 요청사항
          </Label>
          <Textarea
            value={analysisRequest}
            onChange={(e) => setAnalysisRequest(e.target.value)}
            className="min-h-[60px] bg-white border-gray-200 text-gray-900 resize-none text-sm"
            placeholder="분석 요청사항을 입력하세요..."
          />
        </div>

        {/* User Prompt */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
            추가 요청사항 (선택)
          </Label>
          <Textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            className="min-h-[80px] bg-white border-gray-200 text-gray-900 text-sm resize-none"
            placeholder="추가로 요청할 내용이 있다면 입력하세요... (선택사항)"
          />
        </div>

        {/* Common Prompt Preview */}
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
            {commonPrompt.substring(0, 100)}...
          </p>
        </div>

        {/* Query Status */}
        {queryResult ? (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <p className="text-emerald-700 text-sm flex items-center">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2" />
              쿼리 결과 준비됨: {queryResult.rowCount}개 행, {queryResult.columns.length}개 컬럼
              <span className="text-emerald-600 ml-2">
                ({queryResult.executionTime}ms)
              </span>
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-gray-500 text-sm">
              SQL 쿼리를 실행하면 데이터가 연결됩니다
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Common Prompt Editor Modal */}
      {showCommonPromptEditor && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-5 w-[500px] max-h-[600px] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">공통 적용 프롬프트</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  모든 인사이트 생성 시 자동으로 적용됩니다
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
              className="flex-1 min-h-[300px] bg-gray-50 border-gray-200 text-gray-900 text-sm resize-none mb-4"
              placeholder="공통 적용 프롬프트를 입력하세요..."
            />

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetCommonPrompt}
                className="text-gray-500 hover:text-gray-900"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                기본값으로
              </Button>
              <Button
                onClick={saveCommonPrompt}
                className="bg-gray-900 hover:bg-gray-800 text-white"
              >
                <Save className="w-4 h-4 mr-2" />
                저장하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
