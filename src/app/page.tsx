'use client';

import { useState, useCallback, useRef } from 'react';
import { SqlEditor } from '@/components/dashboard/SqlEditor';
import { PromptEditor } from '@/components/dashboard/PromptEditor';
import { DataPreview } from '@/components/dashboard/DataPreview';
import { InsightViewer } from '@/components/dashboard/InsightViewer';
import { BrandSummary } from '@/components/dashboard/BrandSummary';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Sparkles, Loader2, Globe } from 'lucide-react';
import type { QueryResult, InsightResponse } from '@/types';

type Region = 'domestic' | 'china';

interface RegionState {
  queryResult: QueryResult | null;
  currentQuery: string;
  currentAnalysisRequest: string;
  insightResponse: InsightResponse | null;
  activeTab: 'data' | 'insight';
}

const initialRegionState: RegionState = {
  queryResult: null,
  currentQuery: '',
  currentAnalysisRequest: '',
  insightResponse: null,
  activeTab: 'data',
};

export default function HomePage() {
  // 지역 선택 상태
  const [activeRegion, setActiveRegion] = useState<Region>('domestic');
  
  // 각 지역별 독립적인 상태
  const [domesticState, setDomesticState] = useState<RegionState>(initialRegionState);
  const [chinaState, setChinaState] = useState<RegionState>(initialRegionState);
  
  // 로딩 상태 (전역)
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [showBrandSummary, setShowBrandSummary] = useState(false);
  
  // generateInsightFn을 ref로 관리하여 무한 루프 방지
  const generateInsightFnRef = useRef<(() => Promise<void>) | null>(null);

  // 현재 활성 지역의 상태 가져오기
  const currentState = activeRegion === 'domestic' ? domesticState : chinaState;
  const setCurrentState = activeRegion === 'domestic' ? setDomesticState : setChinaState;

  const handleGenerateReady = useCallback((fn: () => Promise<void>) => {
    generateInsightFnRef.current = fn;
  }, []);

  const handleGenerateClick = async () => {
    if (generateInsightFnRef.current) {
      await generateInsightFnRef.current();
    }
  };

  const handleQueryResult = (result: QueryResult, query: string) => {
    setCurrentState(prev => ({
      ...prev,
      queryResult: result,
      currentQuery: query,
      activeTab: 'data',
    }));
  };

  const handleInsightGenerated = (response: InsightResponse) => {
    setCurrentState(prev => ({
      ...prev,
      insightResponse: response,
      activeTab: 'insight',
    }));
  };

  const handleAnalysisRequestChange = (request: string) => {
    setCurrentState(prev => ({
      ...prev,
      currentAnalysisRequest: request,
    }));
  };

  const setActiveTab = (tab: 'data' | 'insight') => {
    setCurrentState(prev => ({ ...prev, activeTab: tab }));
  };

  const getRegionLabel = (region: Region) => {
    return region === 'domestic' ? '국내' : '중국';
  };

  const getRegionEmoji = (region: Region) => {
    return region === 'domestic' ? '🇰🇷' : '🇨🇳';
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
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
              
              {/* Region Tabs */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                {(['domestic', 'china'] as Region[]).map((region) => (
                  <button
                    key={region}
                    onClick={() => setActiveRegion(region)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                      activeRegion === region
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span>{getRegionEmoji(region)}</span>
                    {getRegionLabel(region)}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg">
                <Globe className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  {getRegionEmoji(activeRegion)} {getRegionLabel(activeRegion)}
                </span>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-120px)]">
          {/* Left Panel - Editors */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="h-[45%]">
              <SqlEditor
                key={activeRegion}
                onQueryResult={handleQueryResult}
                isLoading={isQueryLoading}
                setIsLoading={setIsQueryLoading}
                region={activeRegion}
              />
            </div>
            <div className="h-[55%]">
              <PromptEditor
                key={activeRegion}
                queryResult={currentState.queryResult}
                currentQuery={currentState.currentQuery}
                onInsightGenerated={handleInsightGenerated}
                isLoading={isInsightLoading}
                setIsLoading={setIsInsightLoading}
                onGenerateReady={handleGenerateReady}
                onAnalysisRequestChange={handleAnalysisRequestChange}
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
                    currentState.activeTab === 'data'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="mr-1.5">📊</span>
                  쿼리 결과
                  {currentState.queryResult && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                      {currentState.queryResult.rowCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('insight')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    currentState.activeTab === 'insight'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="mr-1.5">💡</span>
                  AI 인사이트
                  {currentState.insightResponse && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                      {(currentState.insightResponse.responseTime / 1000).toFixed(1)}s
                    </span>
                  )}
                </button>
              </div>
              
              {/* AI Insight Generate Button */}
              <Button
                onClick={handleGenerateClick}
                disabled={isInsightLoading || !currentState.queryResult}
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
              {currentState.activeTab === 'data' ? (
                <DataPreview queryResult={currentState.queryResult} />
              ) : (
                <InsightViewer 
                  insightResponse={currentState.insightResponse} 
                  currentQuery={currentState.currentQuery} 
                  analysisRequest={currentState.currentAnalysisRequest}
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
