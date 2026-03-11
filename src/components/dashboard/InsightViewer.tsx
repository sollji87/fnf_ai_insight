'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Copy, Download, Check, Clock, Coins, Cpu, Save, X, Pencil } from 'lucide-react';
import type { InsightResponse, RegionId, SavedInsight } from '@/types';

interface InsightViewerProps {
  insightResponse: InsightResponse | null;
  currentQuery?: string;
  brandName?: string;
  analysisRequest?: string;
  region?: RegionId; // 현재 선택된 국가
}

type SaveMode = 'create' | 'overwrite';

export function InsightViewer({ insightResponse, currentQuery, brandName, analysisRequest, region = 'domestic' }: InsightViewerProps) {
  const [copied, setCopied] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveMode, setSaveMode] = useState<SaveMode>('create');
  const [saveTitle, setSaveTitle] = useState('');
  const [saveBrandName, setSaveBrandName] = useState(brandName || '');
  const [createdBy, setCreatedBy] = useState('');
  const [saveYearMonth, setSaveYearMonth] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedInsights, setSavedInsights] = useState<SavedInsight[]>([]);
  const [selectedInsightId, setSelectedInsightId] = useState('');
  const [isLoadingSavedInsights, setIsLoadingSavedInsights] = useState(false);

  // 편집 관련 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editedInsight, setEditedInsight] = useState('');
  const [currentInsight, setCurrentInsight] = useState(insightResponse?.insight || '');

  // insightResponse가 바뀔 때만 동기화 (수정 후 내용이 원문으로 되돌아가는 문제 방지)
  useEffect(() => {
    setCurrentInsight(insightResponse?.insight || '');
    setIsEditing(false);
    setEditedInsight('');
  }, [insightResponse?.insight]);

  useEffect(() => {
    if (saveMode !== 'overwrite') return;

    if (!selectedInsightId && savedInsights.length > 0) {
      setSelectedInsightId(savedInsights[0].id);
    }
  }, [saveMode, selectedInsightId, savedInsights]);

  useEffect(() => {
    if (saveMode !== 'overwrite' || !selectedInsightId) return;

    const target = savedInsights.find((item) => item.id === selectedInsightId);
    if (!target) return;

    setSaveTitle(target.title || '');
    setSaveBrandName(target.brandName || '');
    setSaveYearMonth(target.yearMonth || '');
  }, [saveMode, selectedInsightId, savedInsights]);

  // 편집 시작
  const startEditing = () => {
    setEditedInsight(currentInsight);
    setIsEditing(true);
  };

  // 편집 취소
  const cancelEditing = () => {
    setEditedInsight('');
    setIsEditing(false);
  };

  // 편집 적용
  const applyEdit = () => {
    setCurrentInsight(editedInsight);
    setIsEditing(false);
  };

  const copyToClipboard = async () => {
    if (!currentInsight) return;

    await navigator.clipboard.writeText(currentInsight);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    if (!currentInsight) return;

    const blob = new Blob([currentInsight], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insight-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getDefaultTitle = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return brandName?.trim()
      ? `${brandName.trim()} AI 인사이트 ${yyyy}-${mm}-${dd}`
      : `AI 인사이트 ${yyyy}-${mm}-${dd}`;
  };

  const fetchSavedInsights = async () => {
    setIsLoadingSavedInsights(true);
    try {
      const response = await fetch('/api/saved-insights');
      const data = await response.json();
      if (data.success) {
        setSavedInsights(data.insights || []);
      } else {
        setSaveError(data.error || '저장된 인사이트 목록을 불러오지 못했습니다.');
      }
    } catch (error) {
      console.error('Fetch saved insights error:', error);
      setSaveError('저장된 인사이트 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoadingSavedInsights(false);
    }
  };

  const getResponseError = async (response: Response) => {
    try {
      const data = await response.json();
      return data?.error || '저장에 실패했습니다.';
    } catch {
      return '저장에 실패했습니다.';
    }
  };

  const handleSave = async () => {
    if (!currentInsight) return;
    if (saveMode === 'create' && !saveTitle.trim()) {
      setSaveError('새로 저장 시 제목은 필수입니다.');
      return;
    }
    if (saveMode === 'overwrite' && !selectedInsightId) {
      setSaveError('덮어쓸 인사이트를 선택해주세요.');
      return;
    }

    setSaveError('');
    setIsSaving(true);
    try {
      const isCreate = saveMode === 'create';
      const response = await fetch('/api/saved-insights', {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isCreate
            ? {
                title: saveTitle.trim(),
                brandName: saveBrandName.trim() || undefined,
                insight: currentInsight,
                query: currentQuery,
                analysisRequest: analysisRequest,
                tokensUsed: insightResponse?.tokensUsed,
                model: insightResponse?.model,
                region: region,
                yearMonth: saveYearMonth.trim() || undefined,
                createdBy: createdBy.trim() || '익명',
              }
            : {
                id: selectedInsightId,
                insight: currentInsight,
                title: saveTitle.trim() || undefined,
                brandName: saveBrandName.trim() || undefined,
                yearMonth: saveYearMonth.trim() || undefined,
                query: currentQuery || undefined,
                analysisRequest: analysisRequest || undefined,
              }
        ),
      });

      if (!response.ok) {
        const errorMessage = await getResponseError(response);
        setSaveError(errorMessage);
        return;
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setShowSaveDialog(false);
        setSaveSuccess(false);
        setSaveError('');
        setSaveMode('create');
        setSaveTitle('');
        setSaveBrandName('');
        setSaveYearMonth('');
        setCreatedBy('');
        setSelectedInsightId('');
      }, 1200);
    } catch (error) {
      console.error('Save error:', error);
      setSaveError('저장 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const openSaveDialog = () => {
    setSaveMode('create');
    setSaveError('');
    setSaveSuccess(false);
    setSaveBrandName(brandName || '');
    setSaveTitle(getDefaultTitle());
    // 현재 연월 기본값 (YYYYMM)
    const now = new Date();
    setSaveYearMonth(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`);
    setSelectedInsightId('');
    setShowSaveDialog(true);
    void fetchSavedInsights();
  };

  if (!insightResponse) {
    return (
      <div className="h-full rounded-xl bg-white border border-gray-200 flex items-center justify-center card-shadow">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
            <FileText className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium text-sm">AI 인사이트가 여기에 표시됩니다</p>
          <p className="text-gray-400 text-xs mt-1">쿼리 실행 후 인사이트를 생성해보세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full rounded-xl bg-white border border-gray-200 flex flex-col overflow-hidden card-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">AI 인사이트</span>
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelEditing}
                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                취소
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={applyEdit}
                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 text-xs"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                적용
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={startEditing}
                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                수정
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={openSaveDialog}
                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                저장
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyToClipboard}
                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 mr-1" />
                )}
                {copied ? '복사됨' : '복사'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadMarkdown}
                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                다운로드
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-5 px-4 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-1.5 text-xs">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-600">
            {(insightResponse.responseTime / 1000).toFixed(1)}초
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Coins className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-600">
            {insightResponse.tokensUsed.toLocaleString()} 토큰
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Cpu className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-500">
            {insightResponse.model}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isEditing ? (
          <Textarea
            value={editedInsight}
            onChange={(e) => setEditedInsight(e.target.value)}
            className="min-h-[500px] text-sm font-mono bg-white border-gray-200 text-gray-900 resize-none"
            placeholder="마크다운 형식으로 수정하세요..."
          />
        ) : (
          <article className="prose prose-sm max-w-none
            prose-headings:text-gray-900 prose-headings:font-semibold prose-headings:border-b prose-headings:border-gray-100 prose-headings:pb-2 prose-headings:mb-4
            prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
            prose-p:text-gray-700 prose-p:leading-relaxed
            prose-li:text-gray-700 prose-li:marker:text-gray-400
            prose-strong:text-gray-900 prose-strong:font-semibold
            prose-code:text-gray-800 prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-code:text-sm
            prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:rounded-lg
            prose-table:border-collapse prose-table:w-full
            prose-th:bg-gray-50 prose-th:text-gray-700 prose-th:px-4 prose-th:py-2 prose-th:border prose-th:border-gray-200 prose-th:text-left prose-th:font-semibold prose-th:text-sm
            prose-td:px-4 prose-td:py-2 prose-td:border prose-td:border-gray-200 prose-td:text-gray-700 prose-td:text-sm
            prose-blockquote:border-l-gray-300 prose-blockquote:bg-gray-50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic
            prose-hr:border-gray-200
          ">
            <ReactMarkdown remarkPlugins={[[remarkGfm, { strikethrough: false }]]}>
              {currentInsight}
            </ReactMarkdown>
          </article>
        )}
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 p-5 w-96 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">인사이트 저장</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveDialog(false)}
                className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            {saveSuccess ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-gray-900 font-medium">저장 완료!</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      저장 방식
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={saveMode === 'create' ? 'default' : 'outline'}
                        onClick={() => setSaveMode('create')}
                        className={saveMode === 'create' ? 'bg-gray-900 hover:bg-gray-800 text-white' : ''}
                      >
                        새로 저장
                      </Button>
                      <Button
                        type="button"
                        variant={saveMode === 'overwrite' ? 'default' : 'outline'}
                        onClick={() => setSaveMode('overwrite')}
                        className={saveMode === 'overwrite' ? 'bg-gray-900 hover:bg-gray-800 text-white' : ''}
                      >
                        기존 덮어쓰기
                      </Button>
                    </div>
                  </div>

                  {saveMode === 'overwrite' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        덮어쓸 인사이트 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedInsightId}
                        onChange={(e) => setSelectedInsightId(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        disabled={isLoadingSavedInsights || savedInsights.length === 0}
                      >
                        <option value="">
                          {isLoadingSavedInsights
                            ? '불러오는 중...'
                            : savedInsights.length === 0
                              ? '저장된 인사이트가 없습니다'
                              : '선택하세요'}
                        </option>
                        {savedInsights.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} ({new Date(item.createdAt).toLocaleDateString('ko-KR')})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      제목 {saveMode === 'create' && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={saveTitle}
                      onChange={(e) => setSaveTitle(e.target.value)}
                      placeholder="예: MLB 1월 매출 분석"
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      브랜드명 (선택)
                    </label>
                    <input
                      type="text"
                      value={saveBrandName}
                      onChange={(e) => setSaveBrandName(e.target.value)}
                      placeholder="예: MLB"
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      연월 (선택)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={saveYearMonth}
                        onChange={(e) => setSaveYearMonth(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="YYYYMM (예: 202512)"
                        maxLength={6}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      />
                      {saveYearMonth.length === 6 && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {saveYearMonth.slice(0, 4)}년 {saveYearMonth.slice(4)}월
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      작성자 (선택)
                    </label>
                    <input
                      type="text"
                      value={createdBy}
                      onChange={(e) => setCreatedBy(e.target.value)}
                      placeholder="예: 홍길동"
                      disabled={saveMode === 'overwrite'}
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>
                </div>

                {saveError && (
                  <p className="text-xs text-red-600 mt-3">{saveError}</p>
                )}

                <div className="flex gap-2 mt-5">
                  <Button
                    variant="outline"
                    onClick={() => setShowSaveDialog(false)}
                    className="flex-1 border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    취소
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={
                      isSaving ||
                      !currentInsight ||
                      (saveMode === 'create' && !saveTitle.trim()) ||
                      (saveMode === 'overwrite' && !selectedInsightId)
                    }
                    className="flex-1 bg-gray-900 hover:bg-gray-800 text-white"
                  >
                    {isSaving ? '저장 중...' : saveMode === 'create' ? '새로 저장' : '덮어쓰기 저장'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
