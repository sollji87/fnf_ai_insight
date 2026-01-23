'use client';

import { useState, useCallback } from 'react';
import { SqlEditor } from '@/components/dashboard/SqlEditor';
import { PromptEditor } from '@/components/dashboard/PromptEditor';
import { DataPreview } from '@/components/dashboard/DataPreview';
import { InsightViewer } from '@/components/dashboard/InsightViewer';
import { BrandSummary } from '@/components/dashboard/BrandSummary';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Sparkles, Loader2 } from 'lucide-react';
import type { QueryResult, InsightResponse } from '@/types';

export default function HomePage() {
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentAnalysisRequest, setCurrentAnalysisRequest] = useState('');
  const [insightResponse, setInsightResponse] = useState<InsightResponse | null>(null);
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [showBrandSummary, setShowBrandSummary] = useState(false);
  const [activeTab, setActiveTab] = useState<'data' | 'insight'>('data');
  const [generateInsightFn, setGenerateInsightFn] = useState<(() => Promise<void>) | null>(null);

  const handleGenerateReady = useCallback((fn: () => Promise<void>) => {
    setGenerateInsightFn(() => fn);
  }, []);

  const handleGenerateClick = async () => {
    if (generateInsightFn) {
      await generateInsightFn();
    }
  };

  const handleQueryResult = (result: QueryResult, query: string) => {
    setQueryResult(result);
    setCurrentQuery(query);
    setActiveTab('data');
  };

  const handleInsightGenerated = (response: InsightResponse) => {
    setInsightResponse(response);
    setActiveTab('insight');
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  F&F AI 인사이트 대시보드
                </h1>
                <p className="text-xs text-gray-500">
                  스노우플레이크 데이터 기반 Claude AI 분석 플랫폼
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowBrandSummary(true)}
              className="bg-gray-900 hover:bg-gray-800 text-white"
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              브랜드별 요약
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-120px)]">
          {/* Left Panel - Editors */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="h-[45%]">
              <SqlEditor
                onQueryResult={handleQueryResult}
                isLoading={isQueryLoading}
                setIsLoading={setIsQueryLoading}
              />
            </div>
            <div className="h-[55%]">
              <PromptEditor
                queryResult={queryResult}
                currentQuery={currentQuery}
                onInsightGenerated={handleInsightGenerated}
                isLoading={isInsightLoading}
                setIsLoading={setIsInsightLoading}
                onGenerateReady={handleGenerateReady}
                onAnalysisRequestChange={setCurrentAnalysisRequest}
              />
            </div>
          </div>

          {/* Right Panel - Results */}
          <div className="lg:col-span-7 flex flex-col">
            {/* Tab Buttons */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('data')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'data'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="mr-1.5">📊</span>
                  쿼리 결과
                  {queryResult && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                      {queryResult.rowCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('insight')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'insight'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="mr-1.5">💡</span>
                  AI 인사이트
                  {insightResponse && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                      {(insightResponse.responseTime / 1000).toFixed(1)}s
                    </span>
                  )}
                </button>
              </div>
              
              {/* AI Insight Generate Button */}
              <Button
                onClick={handleGenerateClick}
                disabled={isInsightLoading || !queryResult}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white h-9 px-4"
              >
                {isInsightLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    AI 인사이트 생성
                  </>
                )}
              </Button>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0">
              {activeTab === 'data' ? (
                <DataPreview queryResult={queryResult} />
              ) : (
                <InsightViewer 
                  insightResponse={insightResponse} 
                  currentQuery={currentQuery} 
                  analysisRequest={currentAnalysisRequest}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Brand Summary Modal */}
      {showBrandSummary && (
        <BrandSummary onClose={() => setShowBrandSummary(false)} />
      )}
    </div>
  );
}
