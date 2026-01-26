'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SqlEditor } from '@/components/dashboard/SqlEditor';
import { PromptEditor } from '@/components/dashboard/PromptEditor';
import { DataPreview } from '@/components/dashboard/DataPreview';
import { InsightViewer } from '@/components/dashboard/InsightViewer';
import { BrandSummary } from '@/components/dashboard/BrandSummary';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Sparkles, Loader2, Globe, Plus, X } from 'lucide-react';
import { AVAILABLE_REGIONS } from '@/lib/prompts';
import type { QueryResult, InsightResponse, RegionId, RegionConfig } from '@/types';

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
  // 활성화된 국가 목록 (서버에서 로드)
  const [activeRegions, setActiveRegions] = useState<RegionId[]>(['domestic', 'china']);
  const [isLoadingRegions, setIsLoadingRegions] = useState(true);
  
  // 현재 선택된 국가
  const [activeRegion, setActiveRegion] = useState<RegionId>('domestic');
  
  // 각 지역별 독립적인 상태 (동적으로 관리)
  const [regionStates, setRegionStates] = useState<Record<RegionId, RegionState>>({
    domestic: initialRegionState,
    china: initialRegionState,
    hmt: initialRegionState,
    usa: initialRegionState,
  });
  
  // 로딩 상태 (전역)
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [showBrandSummary, setShowBrandSummary] = useState(false);
  
  // 국가 추가 드롭다운 상태
  const [showAddRegion, setShowAddRegion] = useState(false);
  
  // generateInsightFn을 ref로 관리하여 무한 루프 방지
  const generateInsightFnRef = useRef<(() => Promise<void>) | null>(null);

  // 서버에서 활성 국가 목록 로드
  useEffect(() => {
    const fetchActiveRegions = async () => {
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (data.success && data.activeRegions) {
          setActiveRegions(data.activeRegions);
        }
      } catch (error) {
        console.error('Failed to fetch active regions:', error);
      } finally {
        setIsLoadingRegions(false);
      }
    };
    fetchActiveRegions();
  }, []);

  // 현재 활성 지역의 상태 가져오기
  const currentState = regionStates[activeRegion];
  const setCurrentState = useCallback((updater: (prev: RegionState) => RegionState) => {
    setRegionStates(prev => ({
      ...prev,
      [activeRegion]: updater(prev[activeRegion]),
    }));
  }, [activeRegion]);

  // 국가 추가
  const handleAddRegion = async (regionId: RegionId) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regionId }),
      });
      const data = await response.json();
      if (data.success) {
        setActiveRegions(data.activeRegions);
      }
    } catch (error) {
      console.error('Failed to add region:', error);
    }
    setShowAddRegion(false);
  };

  // 국가 삭제
  const handleRemoveRegion = async (regionId: RegionId) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regionId }),
      });
      const data = await response.json();
      if (data.success) {
        setActiveRegions(data.activeRegions);
        // 삭제된 국가가 현재 선택된 국가면 첫 번째 국가로 전환
        if (activeRegion === regionId) {
          setActiveRegion(data.activeRegions[0] || 'domestic');
        }
      }
    } catch (error) {
      console.error('Failed to remove region:', error);
    }
  };

  // 추가 가능한 국가 목록 (아직 활성화되지 않은 국가)
  const addableRegions = AVAILABLE_REGIONS.filter(
    r => !r.isDefault && !activeRegions.includes(r.id)
  );

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

  // 국가 정보 가져오기
  const getRegionConfig = (regionId: RegionId): RegionConfig | undefined => {
    return AVAILABLE_REGIONS.find(r => r.id === regionId);
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
              <div className="flex items-center gap-1 bg-gray-200 p-[3px] rounded-lg relative">
                {isLoadingRegions ? (
                  <div className="px-3 py-1.5">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <>
                    {activeRegions.map((regionId) => {
                      const config = getRegionConfig(regionId);
                      if (!config) return null;
                      return (
                        <div key={regionId} className="relative group">
                          <button
                            onClick={() => setActiveRegion(regionId)}
                            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-1.5 ${
                              activeRegion === regionId
                                ? 'bg-gray-900 text-white shadow-md'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            }`}
                          >
                            <span className="text-base">{config.emoji}</span>
                            {config.name}
                          </button>
                          {/* 삭제 버튼 (기본 국가 제외) */}
                          {!config.isDefault && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveRegion(regionId);
                              }}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                              title={`${config.name} 제거`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {/* 국가 추가 버튼 */}
                    {addableRegions.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowAddRegion(!showAddRegion)}
                          className="px-2 py-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all"
                          title="국가 추가"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        {/* 드롭다운 메뉴 */}
                        {showAddRegion && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setShowAddRegion(false)}
                            />
                            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[120px] py-1">
                              {addableRegions.map((region) => (
                                <button
                                  key={region.id}
                                  onClick={() => handleAddRegion(region.id)}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                >
                                  <span>{region.emoji}</span>
                                  {region.name}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg">
                <Globe className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  {getRegionConfig(activeRegion)?.emoji} {getRegionConfig(activeRegion)?.name}
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
                  region={activeRegion}
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
