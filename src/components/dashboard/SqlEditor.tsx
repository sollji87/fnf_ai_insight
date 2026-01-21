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
} from '@/components/ui/select';
import { 
  Play, 
  Loader2, 
  Database, 
  Save, 
  Trash2, 
  FolderOpen,
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
  const [showSavedList, setShowSavedList] = useState(false);
  const [newQueryName, setNewQueryName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SavedQuery['category']>('custom');

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
      id: Date.now().toString(),
      name: newQueryName.trim(),
      query: query,
      category: selectedCategory,
      createdAt: new Date().toISOString(),
    };

    saveQueries([newQuery, ...savedQueries]);
    setNewQueryName('');
    setShowSaveDialog(false);
  };

  const handleDeleteQuery = (id: string) => {
    saveQueries(savedQueries.filter((q) => q.id !== id));
  };

  const handleLoadQuery = (savedQuery: SavedQuery) => {
    setQuery(savedQuery.query);
    setShowSavedList(false);
  };

  const handleTemplateChange = (templateId: string) => {
    const template = SAMPLE_QUERY_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      setQuery(template.query);
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

  const getCategoryColor = (category: SavedQuery['category']) => {
    const colors = {
      sales: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      profit: 'bg-amber-50 text-amber-700 border-amber-200',
      discount: 'bg-violet-50 text-violet-700 border-violet-200',
      brand: 'bg-rose-50 text-rose-700 border-rose-200',
      custom: 'bg-gray-100 text-gray-700 border-gray-200',
    };
    return colors[category];
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

  return (
    <div className="flex flex-col h-full rounded-xl bg-white border border-gray-200 overflow-hidden card-shadow">
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
            onClick={() => setShowSavedList(true)}
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
          >
            <FolderOpen className="w-3.5 h-3.5 mr-1" />
            저장목록
            {savedQueries.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                {savedQueries.length}
              </span>
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
          <Select onValueChange={handleTemplateChange}>
            <SelectTrigger className="w-[120px] h-8 bg-white border-gray-200 text-gray-700 text-xs">
              <SelectValue placeholder="템플릿" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200">
              {SAMPLE_QUERY_TEMPLATES.map((template) => (
                <SelectItem
                  key={template.id}
                  value={template.id}
                  className="text-gray-700 text-sm"
                >
                  {template.name}
                </SelectItem>
              ))}
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

      {/* Saved Queries List */}
      {showSavedList && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white border border-gray-200 rounded-xl p-5 w-[480px] max-h-[500px] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">저장된 쿼리</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSavedList(false)}
                className="text-gray-400 hover:text-gray-600 h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            {savedQueries.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-gray-400">
                <FolderOpen className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-sm">저장된 쿼리가 없습니다</p>
                <p className="text-xs text-gray-400 mt-1">SQL 쿼리를 작성하고 저장해보세요</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2">
                {savedQueries.map((savedQuery) => (
                  <div
                    key={savedQuery.id}
                    className="group p-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 hover:border-gray-200 transition-all cursor-pointer"
                    onClick={() => handleLoadQuery(savedQuery)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 text-sm truncate">
                            {savedQuery.name}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs border ${getCategoryColor(savedQuery.category)}`}>
                            {getCategoryLabel(savedQuery.category)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate font-mono">
                          {savedQuery.query.substring(0, 60)}...
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(savedQuery.createdAt).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuery(savedQuery.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50 h-8 w-8 p-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
