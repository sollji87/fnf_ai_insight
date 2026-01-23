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
} from 'lucide-react';
import { SAMPLE_QUERY_TEMPLATES } from '@/lib/prompts';
import type { QueryResult, SavedQuery } from '@/types';

interface SqlEditorProps {
  onQueryResult: (result: QueryResult, query: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function SqlEditor({ onQueryResult, isLoading, setIsLoading }: SqlEditorProps) {
  const [query, setQuery] = useState('-- SQL 쿼리를 입력하세요\nSELECT * FROM ');
  const [error, setError] = useState<string | null>(null);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newQueryName, setNewQueryName] = useState('');
  const [newQueryCreator, setNewQueryCreator] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SavedQuery['category']>('custom');
  const [selectedQueryId, setSelectedQueryId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
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

  useEffect(() => {
    fetchSavedQueries();
    fetchTableList();
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
          createdBy: newQueryCreator.trim() || '익명',
        }),
      });

      const data = await response.json();

      if (data.success) {
        await fetchSavedQueries();
        setNewQueryName('');
        setNewQueryCreator('');
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

  return (
    <div className="flex flex-col h-full rounded-xl bg-white border border-gray-200 overflow-hidden card-shadow relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center">
            <Database className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">SQL 쿼리</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenAiHelper}
            className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 h-8 text-xs"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            AI 도우미
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyQuery}
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-green-600" />
                <span className="text-green-600">복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                복사
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSaveDialog(true)}
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            저장
          </Button>
          <Select value={selectedQueryId} onValueChange={handleQuerySelect}>
            <SelectTrigger className="w-[160px] h-8 bg-white border-gray-200 text-gray-700 text-xs">
              <SelectValue placeholder="쿼리 선택">{getSelectedLabel()}</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200 max-h-[400px]">
              {savedQueries.length > 0 && (
                <>
                  <SelectGroup>
                    <SelectLabel className="text-xs text-gray-500 font-medium">저장된 쿼리</SelectLabel>
                    {savedQueries.map((saved) => (
                      <div key={saved.id} className="relative group">
                        <SelectItem
                          value={saved.id}
                          className="text-gray-700 text-sm pr-8"
                        >
                          <span className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">
                              {getCategoryLabel(saved.category)}
                            </span>
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
              {savedQueries.length === 0 && SAMPLE_QUERY_TEMPLATES.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400 text-center">
                  저장된 쿼리가 없습니다
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
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
    </div>
  );
}
