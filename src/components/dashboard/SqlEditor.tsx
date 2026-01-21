'use client';

import { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Plus,
  X
} from 'lucide-react';
import { SAMPLE_QUERY_TEMPLATES } from '@/lib/prompts';
import type { QueryResult, SavedQuery } from '@/types';

interface SqlEditorProps {
  onQueryResult: (result: QueryResult, query: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const STORAGE_KEY = 'fnf-saved-queries';

export function SqlEditor({ onQueryResult, isLoading, setIsLoading }: SqlEditorProps) {
  const [query, setQuery] = useState(SAMPLE_QUERY_TEMPLATES[0].query);
  const [error, setError] = useState<string | null>(null);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newQueryName, setNewQueryName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SavedQuery['category']>('custom');
  const [selectedQueryId, setSelectedQueryId] = useState<string>('');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSavedQueries(JSON.parse(stored));
    }
  }, []);

  const saveQueries = (queries: SavedQuery[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
    setSavedQueries(queries);
  };

  const handleSaveQuery = () => {
    if (!newQueryName.trim()) return;

    const newQuery: SavedQuery = {
      id: `saved-${Date.now()}`,
      name: newQueryName.trim(),
      query: query,
      category: selectedCategory,
      createdAt: new Date().toISOString(),
    };

    saveQueries([newQuery, ...savedQueries]);
    setNewQueryName('');
    setShowSaveDialog(false);
    setSelectedQueryId(newQuery.id);
  };

  const handleDeleteQuery = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    saveQueries(savedQueries.filter((q) => q.id !== id));
    if (selectedQueryId === id) {
      setSelectedQueryId('');
    }
  };

  const handleQuerySelect = (value: string) => {
    setSelectedQueryId(value);
    
    // 샘플 템플릿에서 찾기
    const template = SAMPLE_QUERY_TEMPLATES.find((t) => t.id === value);
    if (template) {
      setQuery(template.query);
      return;
    }
    
    // 저장된 쿼리에서 찾기
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

  const getCategoryLabel = (category: SavedQuery['category']) => {
    const labels = {
      sales: '매출',
      profit: '이익',
      discount: '할인',
      brand: '브랜드',
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
                            {saved.name}
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
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-50">
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
                    <SelectItem value="custom" className="text-gray-700">커스텀</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleSaveQuery}
                disabled={!newQueryName.trim()}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white"
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
