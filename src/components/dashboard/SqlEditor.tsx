'use client';

import { useState, useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';
import { 
  Play, 
  Loader2, 
  Database, 
  Save, 
  Trash2,
  X,
  Copy,
  Check,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Wand2,
  ChevronDown,
  ChevronUp,
  Settings2,
  Plus,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { SAMPLE_QUERY_TEMPLATES, AVAILABLE_REGIONS, BRAND_CODES } from '@/lib/prompts';
import type { QueryResult, SavedQuery, RegionId, BrandCode } from '@/types';

interface SavedInsightRef {
  id: string;
  title: string;
  brandName?: string;
  query?: string;
  analysisRequest?: string;
}

interface SqlEditorProps {
  onQueryResult: (result: QueryResult, query: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  region?: RegionId;
  onAnalysisRequestLoad?: (request: string) => void;
}

export function SqlEditor({ onQueryResult, isLoading, setIsLoading, region = 'domestic', onAnalysisRequestLoad }: SqlEditorProps) {
  const [query, setQuery] = useState('-- SQL 쿼리를 입력하세요\nSELECT * FROM ');
  const [error, setError] = useState<string | null>(null);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newQueryName, setNewQueryName] = useState('');
  const [newQueryCreator, setNewQueryCreator] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SavedQuery['category']>('custom');
  const [selectedSaveRegion, setSelectedSaveRegion] = useState<RegionId>(region || 'domestic');
  const [selectedSaveBrand, setSelectedSaveBrand] = useState<BrandCode>('M');
  const [selectedQueryId, setSelectedQueryId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Brand filter state
  const [filterBrand, setFilterBrand] = useState<BrandCode | 'all'>('all');
  
  // Cached insights for prompt loading
  const [cachedInsights, setCachedInsights] = useState<SavedInsightRef[]>([]);
  
  // Batch operations dialog states
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchSourceBrand, setBatchSourceBrand] = useState<BrandCode>('M');
  const [batchTargetBrands, setBatchTargetBrands] = useState<BrandCode[]>([]);
  const [batchDateReplacements, setBatchDateReplacements] = useState<Array<{ from: string; to: string }>>([
    { from: '', to: '' },
  ]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchMigrateExisting, setBatchMigrateExisting] = useState(false);
  const [batchDateBrand, setBatchDateBrand] = useState<BrandCode | 'all'>('all');
  
  // AI Query Helper states
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [aiRequest, setAiRequest] = useState('');
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiImageName, setAiImageName] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Table selection states
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  
  // Query editor collapse state
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);

  // Vercel KV에서 저장된 쿼리 불러오기
  const fetchSavedQueries = async () => {
    try {
      const response = await fetch('/api/saved-queries');
      const data = await response.json();
      if (data.success) {
        setSavedQueries(data.queries || []);
      }
    } catch (err) {
      console.error('Failed to fetch saved queries:', err);
    }
  };

  // Snowflake 테이블 목록 가져오기
  const fetchTableList = async () => {
    setIsLoadingTables(true);
    try {
      const response = await fetch('/api/snowflake/tables');
      const data = await response.json();
      if (data.success) {
        setAvailableTables(data.tables || []);
      }
    } catch (err) {
      console.error('Failed to fetch table list:', err);
    } finally {
      setIsLoadingTables(false);
    }
  };

  // 인사이트 캐시 로드 (프롬프트 매칭용)
  const fetchInsightsForPromptCache = async () => {
    try {
      const response = await fetch('/api/saved-insights');
      const data = await response.json();
      if (data.success && data.insights) {
        setCachedInsights(
          data.insights
            .filter((i: SavedInsightRef) => i.analysisRequest)
            .map((i: SavedInsightRef) => ({
              id: i.id,
              title: i.title,
              brandName: i.brandName,
              query: i.query,
              analysisRequest: i.analysisRequest,
            }))
        );
      }
    } catch (err) {
      console.error('Failed to fetch insights for prompt cache:', err);
    }
  };

  useEffect(() => {
    fetchSavedQueries();
    fetchTableList();
    fetchInsightsForPromptCache();
  }, []);

  const handleCopyQuery = async () => {
    try {
      await navigator.clipboard.writeText(query);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = query;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveQuery = async () => {
    if (!newQueryName.trim()) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/saved-queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newQueryName.trim(),
          query: query,
          category: selectedCategory,
          region: selectedSaveRegion,
          brand: selectedSaveBrand,
          createdBy: newQueryCreator.trim() || '익명',
        }),
      });

      const data = await response.json();

      if (data.success) {
        await fetchSavedQueries();
        setNewQueryName('');
        setNewQueryCreator('');
        setSelectedSaveRegion(region || 'domestic');
        setSelectedSaveBrand('M');
        setShowSaveDialog(false);
        setSelectedQueryId(data.query.id);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('쿼리 저장에 실패했습니다.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteQuery = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    try {
      const response = await fetch('/api/saved-queries', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (response.ok) {
        await fetchSavedQueries();
        if (selectedQueryId === id) {
          setSelectedQueryId('');
        }
      }
    } catch (err) {
      console.error('Failed to delete query:', err);
    }
  };

  const handleQuerySelect = (value: string) => {
    setSelectedQueryId(value);
    
    const template = SAMPLE_QUERY_TEMPLATES.find((t) => t.id === value);
    if (template) {
      setQuery(template.query);
      return;
    }
    
    const saved = savedQueries.find((q) => q.id === value);
    if (saved) {
      setQuery(saved.query);
      
      // 매칭되는 인사이트의 analysisRequest 자동 로드 (브랜드 무관)
      if (onAnalysisRequestLoad && cachedInsights.length > 0) {
        // 브랜드명 제거 함수: "MLB KIDS 12월 매출분석" → "12월 매출분석"
        const BRAND_NAMES_PATTERN = /^(MLB\s*KIDS|MLB|DISCOVERY|DUVETICA|SERGIO\s*TACCHINI)\s*/i;
        const stripBrand = (name: string) => name.replace(BRAND_NAMES_PATTERN, '').trim().toLowerCase();
        
        const queryNameStripped = stripBrand(saved.name);
        
        // 1차: 쿼리명에서 브랜드 제거 후 인사이트 제목과 매칭
        let matchedInsight = cachedInsights.find((i) => {
          if (!i.title || !i.analysisRequest) return false;
          const titleStripped = stripBrand(i.title);
          return titleStripped === queryNameStripped;
        });
        
        // 2차: 부분 포함 매칭 (쿼리명이 인사이트 제목에 포함되거나 반대)
        if (!matchedInsight && queryNameStripped.length > 3) {
          matchedInsight = cachedInsights.find((i) => {
            if (!i.title || !i.analysisRequest) return false;
            const titleStripped = stripBrand(i.title);
            return titleStripped.includes(queryNameStripped) || queryNameStripped.includes(titleStripped);
          });
        }
        
        // 3차: SQL 쿼리 텍스트 매칭 (브랜드코드 정규화 후 비교)
        if (!matchedInsight) {
          const normalizeQuery = (q: string) => 
            q.replace(/brd_cd\s*=\s*'[A-Z]{1,2}'/gi, "brd_cd='M'").trim();
          const queryNormalized = normalizeQuery(saved.query);
          matchedInsight = cachedInsights.find(
            (i) => i.query && normalizeQuery(i.query) === queryNormalized
          );
        }
        
        if (matchedInsight?.analysisRequest) {
          onAnalysisRequestLoad(matchedInsight.analysisRequest);
        }
      }
    }
  };

  const executeQuery = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/snowflake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '쿼리 실행 실패');
      }

      onQueryResult(data.data, query);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAiHelper = () => {
    setShowAiHelper(true);
    fetchTableList();
  };

  // AI Helper functions
  const resizeImage = (file: File, maxWidth: number = 800, maxHeight: number = 800): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // 비율 유지하면서 리사이즈
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // JPEG로 변환하여 용량 줄이기
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAiError('이미지 파일만 업로드 가능합니다.');
      return;
    }

    try {
      // 이미지 리사이즈 (최대 800x800)
      const resizedImage = await resizeImage(file, 800, 800);
      setAiImage(resizedImage);
      setAiImageName(file.name);
      setAiError(null);
    } catch {
      setAiError('이미지 처리 중 오류가 발생했습니다.');
    }
  };

  const handleAiGenerate = async () => {
    if (!aiRequest.trim() && !aiImage && selectedTables.length === 0) {
      setAiError('요청 내용, 테이블 이미지, 또는 테이블을 선택해주세요.');
      return;
    }

    setIsAiLoading(true);
    setAiError(null);

    // 선택된 테이블 정보를 요청에 추가
    let enhancedRequest = aiRequest;
    if (selectedTables.length > 0) {
      const tableInfo = `사용할 테이블: ${selectedTables.join(', ')}`;
      enhancedRequest = aiRequest ? `${tableInfo}\n\n${aiRequest}` : tableInfo;
    }

    try {
      const response = await fetch('/api/query-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentQuery: query,
          userRequest: enhancedRequest,
          tableImage: aiImage,
          tables: selectedTables,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI 쿼리 생성 실패');
      }

      setQuery(data.query);
      setShowAiHelper(false);
      setAiRequest('');
      setAiImage(null);
      setAiImageName(null);
      setSelectedTables([]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsAiLoading(false);
    }
  };

  const getCategoryLabel = (category: SavedQuery['category']) => {
    const labels: Record<SavedQuery['category'], string> = {
      sales: '매출',
      profit: '이익',
      discount: '할인',
      brand: '브랜드',
      inventory: '재고',
      hr: '인원',
      custom: '커스텀',
    };
    return labels[category];
  };

  const getSelectedLabel = () => {
    if (!selectedQueryId) return '쿼리 선택';
    
    const template = SAMPLE_QUERY_TEMPLATES.find((t) => t.id === selectedQueryId);
    if (template) return template.name;
    
    const saved = savedQueries.find((q) => q.id === selectedQueryId);
    if (saved) return saved.name;
    
    return '쿼리 선택';
  };

  const getBrandLabel = (code: BrandCode): string => {
    const brand = BRAND_CODES.find(b => b.code === code);
    return brand ? brand.name : code;
  };

  // 일괄 복사 실행
  const handleBatchCopy = async () => {
    if (batchTargetBrands.length === 0) {
      setBatchError('대상 브랜드를 하나 이상 선택해주세요.');
      return;
    }

    setIsBatchProcessing(true);
    setBatchError(null);
    setBatchResult(null);

    try {
      // 기존 쿼리에 브랜드 미설정된 것들을 소스 브랜드로 마이그레이션
      if (batchMigrateExisting) {
        await fetch('/api/saved-queries', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set-brand',
            sourceBrand: batchSourceBrand,
          }),
        });
      }

      // 유효한 날짜 치환만 필터링
      const validDateReplacements = batchDateReplacements.filter(
        d => d.from.trim() && d.to.trim()
      );

      const response = await fetch('/api/saved-queries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk-copy',
          sourceBrand: batchSourceBrand,
          targetBrands: batchTargetBrands,
          dateReplacements: validDateReplacements.length > 0 ? validDateReplacements : undefined,
          region: region,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '일괄 복사 실패');
      }

      setBatchResult(data.message);
      await fetchSavedQueries();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // 날짜 일괄 변경만 실행
  const handleBatchDateUpdate = async () => {
    const validDateReplacements = batchDateReplacements.filter(
      d => d.from.trim() && d.to.trim()
    );

    if (validDateReplacements.length === 0) {
      setBatchError('변경할 날짜를 입력해주세요.');
      return;
    }

    setIsBatchProcessing(true);
    setBatchError(null);
    setBatchResult(null);

    try {
      const response = await fetch('/api/saved-queries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk-update-dates',
          dateReplacements: validDateReplacements,
          region: region,
          brand: batchDateBrand !== 'all' ? batchDateBrand : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '날짜 변경 실패');
      }

      setBatchResult(data.message);
      await fetchSavedQueries();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // 날짜 치환 행 추가/삭제
  const addDateReplacement = () => {
    setBatchDateReplacements(prev => [...prev, { from: '', to: '' }]);
  };

  const removeDateReplacement = (index: number) => {
    setBatchDateReplacements(prev => prev.filter((_, i) => i !== index));
  };

  const updateDateReplacement = (index: number, field: 'from' | 'to', value: string) => {
    setBatchDateReplacements(prev =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // 현재 지역의 쿼리를 브랜드 필터 적용하여 필터링
  const filteredSavedQueries = savedQueries.filter(q => {
    const matchesRegion = q.region === region || !q.region;
    const matchesBrand = filterBrand === 'all' || q.brand === filterBrand || (!q.brand && filterBrand === 'M');
    return matchesRegion && matchesBrand;
  });

  return (
    <div className="flex flex-col h-full rounded-xl bg-white border border-gray-200 overflow-hidden card-shadow relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-6 h-6 rounded-md bg-gray-900 flex items-center justify-center">
            <Database className="w-3 h-3 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-xs">SQL</span>
        </div>
        <div className="flex items-center gap-0.5 flex-1 justify-end min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenAiHelper}
            className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 h-7 px-1.5 text-[11px]"
          >
            <Sparkles className="w-3 h-3 mr-0.5" />
            AI
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyQuery}
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 h-7 px-1.5 text-[11px]"
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSaveDialog(true)}
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 h-7 px-1.5 text-[11px]"
          >
            <Save className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBatchResult(null);
              setBatchError(null);
              setShowBatchDialog(true);
            }}
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 h-7 px-1.5 text-[11px]"
            title="쿼리 일괄 복사/날짜 변경"
          >
            <Settings2 className="w-3 h-3" />
          </Button>
          {/* Brand Filter */}
          <Select value={filterBrand} onValueChange={(v) => setFilterBrand(v as BrandCode | 'all')}>
            <SelectTrigger className="w-[80px] h-7 bg-white border-gray-200 text-gray-700 text-[11px] px-2">
              <SelectValue placeholder="브랜드" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200">
              <SelectItem value="all" className="text-gray-700 text-xs">전체</SelectItem>
              {BRAND_CODES.map((b) => (
                <SelectItem key={b.code} value={b.code} className="text-gray-700 text-xs">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedQueryId} onValueChange={handleQuerySelect}>
            <SelectTrigger className="w-[120px] h-7 bg-white border-gray-200 text-gray-700 text-[11px] px-2 truncate">
              <SelectValue placeholder="쿼리 선택">{getSelectedLabel()}</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200 max-h-[400px]">
              {filteredSavedQueries.length > 0 && (
                <>
                  <SelectGroup>
                    <SelectLabel className="text-xs text-gray-500 font-medium">
                      저장된 쿼리 ({filterBrand === 'all' ? '전체' : getBrandLabel(filterBrand as BrandCode)})
                    </SelectLabel>
                    {filteredSavedQueries.map((saved) => (
                      <div key={saved.id} className="relative group">
                        <SelectItem
                          value={saved.id}
                          className="text-gray-700 text-sm pr-8"
                        >
                          <span className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">
                              {getCategoryLabel(saved.category)}
                            </span>
                            {saved.brand && (
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px]">
                                {getBrandLabel(saved.brand)}
                              </span>
                            )}
                            <span className="flex flex-col">
                              <span>{saved.name}</span>
                              {saved.createdBy && (
                                <span className="text-[10px] text-gray-400">by {saved.createdBy}</span>
                              )}
                            </span>
                          </span>
                        </SelectItem>
                        <button
                          onClick={(e) => handleDeleteQuery(saved.id, e)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                </>
              )}
              {SAMPLE_QUERY_TEMPLATES.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-xs text-gray-500 font-medium">기본 템플릿</SelectLabel>
                  {SAMPLE_QUERY_TEMPLATES.map((template) => (
                    <SelectItem
                      key={template.id}
                      value={template.id}
                      className="text-gray-700 text-sm"
                    >
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {filteredSavedQueries.length === 0 && SAMPLE_QUERY_TEMPLATES.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400 text-center">
                  저장된 쿼리가 없습니다
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Editor Toggle */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/30">
        <button
          onClick={() => setIsEditorCollapsed(!isEditorCollapsed)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors w-full"
        >
          {isEditorCollapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
          <span>쿼리 {isEditorCollapsed ? '펼치기' : '접기'}</span>
          <span className="ml-auto text-gray-400">
            {query.split('\n').length}줄
          </span>
        </button>
      </div>

      {/* Editor */}
      <div className={`overflow-hidden transition-all duration-200 ${isEditorCollapsed ? 'h-0' : 'flex-1'}`}>
        <CodeMirror
          value={query}
          height="100%"
          theme="light"
          extensions={[sql()]}
          onChange={(value) => setQuery(value)}
          className="h-full text-sm"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: true,
          }}
        />
      </div>
      
      {/* Collapsed Preview */}
      {isEditorCollapsed && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
          <pre className="text-xs text-gray-500 font-mono truncate">
            {query.split('\n').slice(0, 2).join(' ').substring(0, 80)}...
          </pre>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t border-gray-100 bg-gray-50/50">
        <Button
          onClick={executeQuery}
          disabled={isLoading || !query.trim()}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white h-9"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              실행 중...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              쿼리 실행
            </>
          )}
        </Button>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-5 w-[380px] shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">쿼리 저장</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveDialog(false)}
                className="text-gray-400 hover:text-gray-600 h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block">쿼리 이름</label>
                <Input
                  value={newQueryName}
                  onChange={(e) => setNewQueryName(e.target.value)}
                  placeholder="예: 브랜드별 월간 매출"
                  className="bg-white border-gray-200 text-gray-900"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block">작성자</label>
                <Input
                  value={newQueryCreator}
                  onChange={(e) => setNewQueryCreator(e.target.value)}
                  placeholder="예: 홍길동 (선택사항)"
                  className="bg-white border-gray-200 text-gray-900"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block">국가</label>
                <Select value={selectedSaveRegion} onValueChange={(v) => setSelectedSaveRegion(v as RegionId)}>
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {AVAILABLE_REGIONS.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-gray-700">
                        <span className="flex items-center gap-2">{r.emoji} {r.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block">브랜드</label>
                <Select value={selectedSaveBrand} onValueChange={(v) => setSelectedSaveBrand(v as BrandCode)}>
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {BRAND_CODES.map((b) => (
                      <SelectItem key={b.code} value={b.code} className="text-gray-700">
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">[{b.code}]</span>
                          {b.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block">카테고리</label>
                <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as SavedQuery['category'])}>
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="sales" className="text-gray-700">매출</SelectItem>
                    <SelectItem value="profit" className="text-gray-700">이익</SelectItem>
                    <SelectItem value="discount" className="text-gray-700">할인</SelectItem>
                    <SelectItem value="brand" className="text-gray-700">브랜드</SelectItem>
                    <SelectItem value="inventory" className="text-gray-700">재고</SelectItem>
                    <SelectItem value="hr" className="text-gray-700">인원현황</SelectItem>
                    <SelectItem value="custom" className="text-gray-700">커스텀</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleSaveQuery}
                disabled={!newQueryName.trim() || isSaving}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    저장하기 (모든 사용자 공유)
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Query Helper Dialog */}
      {showAiHelper && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-5 w-[480px] max-h-[90vh] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">AI 쿼리 도우미</h3>
                  <p className="text-xs text-gray-500">자연어로 SQL 쿼리를 생성하거나 수정하세요</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAiHelper(false);
                  setAiError(null);
                  setSelectedTables([]);
                }}
                className="text-gray-400 hover:text-gray-600 h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Table Selection */}
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  Snowflake 테이블 선택 (자동으로 스키마 가져옴)
                </label>
                {isLoadingTables ? (
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-500">테이블 목록 로딩 중...</span>
                  </div>
                ) : availableTables.length > 0 ? (
                  <div className="border border-gray-200 rounded-lg bg-white max-h-[150px] overflow-y-auto">
                    <div className="p-2 space-y-1">
                      {availableTables.map((table) => (
                        <label
                          key={table}
                          className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTables.includes(table)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTables([...selectedTables, table]);
                              } else {
                                setSelectedTables(selectedTables.filter((t) => t !== table));
                              }
                            }}
                            className="w-4 h-4 text-purple-600 rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">{table}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <p className="text-sm text-gray-500">테이블을 찾을 수 없습니다.</p>
                  </div>
                )}
                {selectedTables.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedTables.map((table) => (
                      <span
                        key={table}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs"
                      >
                        {table}
                        <button
                          onClick={() => setSelectedTables(selectedTables.filter((t) => t !== table))}
                          className="hover:text-purple-900"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Image Upload */}
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  테이블 구조 이미지 (선택)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                {aiImage ? (
                  <div className="relative border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-white border border-gray-200">
                        <img src={aiImage} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-700 font-medium truncate">{aiImageName}</p>
                        <p className="text-xs text-gray-500">이미지 업로드 완료</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAiImage(null);
                          setAiImageName(null);
                        }}
                        className="text-gray-400 hover:text-red-500 h-8 w-8 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:bg-purple-50/50 transition-colors"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-6 h-6 text-gray-400" />
                      <span className="text-sm text-gray-500">
                        클릭하여 테이블 구조 캡처 업로드
                      </span>
                    </div>
                  </button>
                )}
              </div>

              {/* Request Input */}
              <div>
                <label className="text-sm text-gray-600 mb-1.5 block flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5" />
                  요청사항
                </label>
                <Textarea
                  value={aiRequest}
                  onChange={(e) => setAiRequest(e.target.value)}
                  placeholder="예: 브랜드별 월간 매출 합계를 구해줘, 할인율 컬럼을 추가해줘, 이 테이블로 SELECT 쿼리 만들어줘..."
                  className="bg-white border-gray-200 text-gray-900 min-h-[100px] resize-none"
                />
              </div>

              {/* Current Query Preview */}
              {query.trim() && query !== '-- SQL 쿼리를 입력하세요\nSELECT * FROM ' && (
                <div>
                  <label className="text-sm text-gray-500 mb-1.5 block">현재 쿼리 (수정 기반)</label>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 max-h-20 overflow-y-auto">
                    <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap">{query}</pre>
                  </div>
                </div>
              )}

              {/* Error */}
              {aiError && (
                <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
                  {aiError}
                </div>
              )}
            </div>

            {/* Actions - Fixed at bottom */}
            <div className="flex-shrink-0 pt-4 mt-4 border-t border-gray-100">
              <Button
                onClick={handleAiGenerate}
                disabled={isAiLoading || (!aiRequest.trim() && !aiImage && selectedTables.length === 0)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isAiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    AI가 쿼리 생성 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    쿼리 생성하기
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Operations Dialog */}
      {showBatchDialog && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-5 w-[520px] max-h-[90vh] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Settings2 className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">쿼리 일괄 작업</h3>
                  <p className="text-xs text-gray-500">브랜드 복사 및 날짜 조건 일괄 변경</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBatchDialog(false)}
                className="text-gray-400 hover:text-gray-600 h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5">
              {/* Section 1: Brand Copy */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Copy className="w-4 h-4 text-blue-500" />
                  브랜드별 쿼리 복사
                </h4>
                <p className="text-xs text-gray-500 mb-3">
                  소스 브랜드의 쿼리를 선택한 브랜드로 복사합니다. SQL 내 <code className="bg-gray-200 px-1 rounded">brd_cd</code> 값이 자동으로 치환됩니다.
                </p>

                {/* Migrate existing queries checkbox */}
                <label className="flex items-center gap-2 mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchMigrateExisting}
                    onChange={(e) => setBatchMigrateExisting(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-gray-300"
                  />
                  <span className="text-xs text-amber-800">
                    브랜드 미설정 쿼리를 소스 브랜드로 자동 설정 (기존 MLB 쿼리 마이그레이션)
                  </span>
                </label>

                {/* Source Brand */}
                <div className="mb-3">
                  <label className="text-xs text-gray-600 mb-1 block">소스 브랜드</label>
                  <Select value={batchSourceBrand} onValueChange={(v) => setBatchSourceBrand(v as BrandCode)}>
                    <SelectTrigger className="bg-white border-gray-200 text-gray-900 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {BRAND_CODES.map((b) => (
                        <SelectItem key={b.code} value={b.code} className="text-gray-700">
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">[{b.code}]</span>
                            {b.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Target Brands */}
                <div className="mb-3">
                  <label className="text-xs text-gray-600 mb-1 block">
                    대상 브랜드 <span className="text-gray-400">(복수 선택 가능)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {BRAND_CODES.filter(b => b.code !== batchSourceBrand).map((b) => {
                      const isSelected = batchTargetBrands.includes(b.code);
                      return (
                        <button
                          key={b.code}
                          onClick={() => {
                            setBatchTargetBrands(prev =>
                              isSelected
                                ? prev.filter(c => c !== b.code)
                                : [...prev, b.code]
                            );
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            isSelected
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-gray-400 mr-1">[{b.code}]</span>
                          {b.name}
                          {isSelected && <Check className="w-3 h-3 ml-1 inline" />}
                        </button>
                      );
                    })}
                  </div>
                  {batchTargetBrands.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                      <ArrowRight className="w-3 h-3" />
                      <span className="text-gray-400">[{batchSourceBrand}]</span>
                      <span>{getBrandLabel(batchSourceBrand)}</span>
                      <ArrowRight className="w-3 h-3 mx-1" />
                      {batchTargetBrands.map((code, i) => (
                        <span key={code}>
                          {i > 0 && ', '}
                          <span className="text-blue-600">[{code}] {getBrandLabel(code)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Date Replacement */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-green-500" />
                  날짜 조건 변경
                </h4>
                <p className="text-xs text-gray-500 mb-3">
                  SQL 쿼리 내 날짜 문자열을 찾아 일괄 치환합니다. 복사 시 함께 적용되거나, 기존 쿼리에 단독 적용할 수 있습니다.
                </p>
                
                {/* 날짜 변경 대상 브랜드 선택 */}
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">대상 브랜드 (날짜만 변경 시)</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setBatchDateBrand('all')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border ${
                        batchDateBrand === 'all'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                      }`}
                    >
                      전체
                    </button>
                    {(['M', 'I', 'X', 'V', 'ST'] as BrandCode[]).map((b) => (
                      <button
                        key={b}
                        onClick={() => setBatchDateBrand(b)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border ${
                          batchDateBrand === b
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                        }`}
                      >
                        {{ M: 'MLB', I: 'MLB KIDS', X: 'DISCOVERY', V: 'DUVETICA', ST: 'SERGIO TACCHINI' }[b]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-gray-400 mb-3 bg-white border border-gray-200 rounded-lg p-2">
                  <span className="font-medium text-gray-500">예시:</span>
                  <div className="mt-1 space-y-0.5">
                    <div>&apos;202512&apos; → &apos;202601&apos; (월 변경)</div>
                    <div>&apos;2025-12&apos; → &apos;2026-01&apos; (하이픈 형식)</div>
                    <div>&apos;20251231&apos; → &apos;20260131&apos; (일 변경)</div>
                    <div>&apos;2025&apos; → &apos;2026&apos; (연도 변경)</div>
                  </div>
                </div>

                {batchDateReplacements.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <Input
                      value={item.from}
                      onChange={(e) => updateDateReplacement(index, 'from', e.target.value)}
                      placeholder="찾을 값 (예: 202512)"
                      className="flex-1 bg-white border-gray-200 text-gray-900 h-9 text-sm"
                    />
                    <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <Input
                      value={item.to}
                      onChange={(e) => updateDateReplacement(index, 'to', e.target.value)}
                      placeholder="바꿀 값 (예: 202601)"
                      className="flex-1 bg-white border-gray-200 text-gray-900 h-9 text-sm"
                    />
                    {batchDateReplacements.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDateReplacement(index)}
                        className="text-gray-400 hover:text-red-500 h-8 w-8 p-0 flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addDateReplacement}
                  className="text-gray-500 hover:text-gray-700 text-xs mt-1"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  치환 규칙 추가
                </Button>
              </div>

              {/* Result/Error Messages */}
              {batchResult && (
                <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {batchResult}
                </div>
              )}
              {batchError && (
                <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
                  {batchError}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 pt-4 mt-4 border-t border-gray-100 flex gap-2">
              <Button
                onClick={handleBatchCopy}
                disabled={isBatchProcessing || batchTargetBrands.length === 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isBatchProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    브랜드 복사 실행
                  </>
                )}
              </Button>
              <Button
                onClick={handleBatchDateUpdate}
                disabled={isBatchProcessing || batchDateReplacements.every(d => !d.from.trim() || !d.to.trim())}
                variant="outline"
                className="flex-1 border-green-300 text-green-700 hover:bg-green-50"
              >
                {isBatchProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    날짜만 변경
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
