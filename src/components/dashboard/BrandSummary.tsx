'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  LayoutGrid,
  Loader2,
  Plus,
  Trash2,
  FileText,
  Copy,
  Download,
  Check,
  X,
  Sparkles,
  RefreshCw,
  BookOpen,
  Save,
  Settings,
  ChevronDown,
  ChevronUp,
  Eye,
  FileDown,
} from 'lucide-react';
import { SAMPLE_BRANDS, SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE, AVAILABLE_REGIONS } from '@/lib/prompts';
import type { BrandInsight, InsightResponse, SavedInsight, RegionId } from '@/types';

interface BrandSummaryProps {
  onClose: () => void;
}

export function BrandSummary({ onClose }: BrandSummaryProps) {
  const [mode, setMode] = useState<'new' | 'saved'>('saved');
  const [brands, setBrands] = useState<string[]>(SAMPLE_BRANDS);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const [brandInsights, setBrandInsights] = useState<BrandInsight[]>([]);
  const [summary, setSummary] = useState<InsightResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [queryTemplate, setQueryTemplate] = useState(`-- 브랜드별 분석 쿼리
SELECT 
    brand_name,
    SUM(act_sale_amt) as total_sales
FROM sales_table
WHERE sale_date >= DATEADD(month, -1, CURRENT_DATE())
GROUP BY brand_name
ORDER BY total_sales DESC;`);

  // 저장된 인사이트 관련 상태
  const [savedInsights, setSavedInsights] = useState<SavedInsight[]>([]);
  const [selectedInsights, setSelectedInsights] = useState<string[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  
  // 국가 필터 상태
  const [selectedRegion, setSelectedRegion] = useState<RegionId>('domestic');

  // 요약 보고서 저장 관련 상태
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);

  // 프롬프트 지침 상태
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(
    `다음 사항에 초점을 맞춰 분석해주세요:
1. 핵심 성과 (매출, 성장률, 수익성)
2. 주요 리스크 및 개선 필요 사항
3. CEO 전략 방향 및 액션 플랜

※ 분량: A4 1-2페이지 내외로 간결하게 작성`
  );

  // 인사이트 상세보기 상태
  const [viewingInsight, setViewingInsight] = useState<SavedInsight | null>(null);
  const [isQueryCollapsed, setIsQueryCollapsed] = useState(true);

  // PDF 내보내기 상태
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // 저장된 인사이트 불러오기
  const fetchSavedInsights = async () => {
    setIsLoadingInsights(true);
    try {
      const response = await fetch('/api/saved-insights');
      const data = await response.json();
      if (data.success) {
        setSavedInsights(data.insights || []);
      }
    } catch (error) {
      console.error('Failed to fetch saved insights:', error);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  // 저장된 인사이트 삭제
  const deleteInsight = async (id: string) => {
    try {
      await fetch('/api/saved-insights', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setSavedInsights((prev) => prev.filter((i) => i.id !== id));
      setSelectedInsights((prev) => prev.filter((sid) => sid !== id));
    } catch (error) {
      console.error('Failed to delete insight:', error);
    }
  };

  // 인사이트 선택 토글
  const toggleInsightSelection = (id: string) => {
    setSelectedInsights((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // 저장된 인사이트로 종합 요약 생성
  const generateSummaryFromSaved = async () => {
    if (selectedInsights.length === 0) return;

    setIsGenerating(true);
    setCurrentStep('저장된 인사이트 종합 중...');
    setSummary(null);

    const selectedData = savedInsights
      .filter((i) => selectedInsights.includes(i.id))
      .map((i) => ({
        brandName: i.brandName || i.title,
        insight: i.insight,
      }));

    try {
      const summaryResponse = await fetch('/api/insight', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandInsights: selectedData,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });

      const summaryData = await summaryResponse.json();

      if (summaryResponse.ok) {
        setSummary({
          insight: summaryData.summary,
          tokensUsed: summaryData.tokensUsed,
          responseTime: summaryData.responseTime,
          model: summaryData.model,
        });
      }
    } catch (error) {
      console.error('요약 생성 실패:', error);
    }

    setCurrentStep(null);
    setIsGenerating(false);
    setReportSaved(false); // 새 요약 생성 시 저장 상태 초기화
  };

  // 요약 보고서 저장
  const saveSummaryReport = async () => {
    if (!summary) return;

    setIsSavingReport(true);
    try {
      // 제목 생성: 선택된 인사이트 또는 브랜드 기반
      const titleParts = mode === 'saved'
        ? savedInsights
            .filter((i) => selectedInsights.includes(i.id))
            .map((i) => i.brandName || i.title)
            .slice(0, 3)
        : selectedBrands.slice(0, 3);
      
      const titleSuffix = (mode === 'saved' ? selectedInsights.length : selectedBrands.length) > 3 
        ? ` 외 ${(mode === 'saved' ? selectedInsights.length : selectedBrands.length) - 3}개` 
        : '';
      
      const reportTitle = `[종합 요약] ${titleParts.join(', ')}${titleSuffix}`;

      const response = await fetch('/api/saved-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: reportTitle,
          brandName: '종합 요약 보고서',
          insight: summary.insight,
          tokensUsed: summary.tokensUsed,
          model: summary.model,
          createdBy: '시스템',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setReportSaved(true);
        // 저장된 인사이트 목록 새로고침
        fetchSavedInsights();
        // 3초 후 저장 완료 상태 초기화
        setTimeout(() => setReportSaved(false), 3000);
      }
    } catch (error) {
      console.error('요약 보고서 저장 실패:', error);
    } finally {
      setIsSavingReport(false);
    }
  };

  useEffect(() => {
    fetchSavedInsights();
  }, []);

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  const addBrand = () => {
    if (newBrand.trim() && !brands.includes(newBrand.trim())) {
      setBrands((prev) => [...prev, newBrand.trim()]);
      setNewBrand('');
    }
  };

  const removeBrand = (brand: string) => {
    setBrands((prev) => prev.filter((b) => b !== brand));
    setSelectedBrands((prev) => prev.filter((b) => b !== brand));
  };

  const generateBrandInsights = async () => {
    if (selectedBrands.length === 0) return;

    setIsGenerating(true);
    setBrandInsights([]);
    setSummary(null);
    setReportSaved(false); // 새 분석 시작 시 저장 상태 초기화

    const insights: BrandInsight[] = [];

    for (const brand of selectedBrands) {
      setCurrentStep(`${brand} 분석 중...`);

      try {
        const brandQuery = queryTemplate
          .replace(/brand_name\s*=\s*'[^']*'/gi, `brand_name = '${brand}'`)
          .replace(/WHERE\s+/i, `WHERE brand_name = '${brand}' AND `);

        const response = await fetch('/api/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: brandQuery,
            systemPrompt: SYSTEM_PROMPT,
            userPrompt: DEFAULT_USER_PROMPT_TEMPLATE,
            analysisRequest: `${brand} 브랜드의 경영 현황을 분석해주세요.`,
            brandName: brand,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          insights.push({
            brandName: brand,
            insight: data.insight,
            data: data.queryResult,
          });
        } else {
          insights.push({
            brandName: brand,
            insight: `오류: ${data.error}`,
            data: null,
          });
        }
      } catch (error) {
        insights.push({
          brandName: brand,
          insight: `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
          data: null,
        });
      }

      setBrandInsights([...insights]);
    }

    setCurrentStep('전체 요약 생성 중...');

    try {
      const summaryResponse = await fetch('/api/insight', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandInsights: insights.map((bi) => ({
            brandName: bi.brandName,
            insight: bi.insight,
          })),
        }),
      });

      const summaryData = await summaryResponse.json();

      if (summaryResponse.ok) {
        setSummary({
          insight: summaryData.summary,
          tokensUsed: summaryData.tokensUsed,
          responseTime: summaryData.responseTime,
          model: summaryData.model,
        });
      }
    } catch (error) {
      console.error('요약 생성 실패:', error);
    }

    setCurrentStep(null);
    setIsGenerating(false);
  };

  const copyToClipboard = async () => {
    const fullContent = brandInsights
      .map((bi) => `# ${bi.brandName}\n\n${bi.insight}`)
      .join('\n\n---\n\n');

    const summaryContent = summary ? `\n\n---\n\n# 전체 요약\n\n${summary.insight}` : '';

    await navigator.clipboard.writeText(fullContent + summaryContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAll = () => {
    const fullContent = brandInsights
      .map((bi) => `# ${bi.brandName}\n\n${bi.insight}`)
      .join('\n\n---\n\n');

    const summaryContent = summary ? `\n\n---\n\n# 전체 요약\n\n${summary.insight}` : '';

    const blob = new Blob([fullContent + summaryContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brand-insights-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // PDF 내보내기 함수
  const exportToPdf = async () => {
    if (selectedInsights.length === 0) return;

    setIsExportingPdf(true);

    try {
      // 동적 임포트 (클라이언트 사이드에서만 로드)
      const html2pdf = (await import('html2pdf.js')).default;
      
      // 선택된 인사이트 데이터 가져오기
      const selectedData = savedInsights.filter((i) => selectedInsights.includes(i.id));
      
      // PDF용 HTML 컨테이너 생성 (DOM에 추가해야 html2canvas가 캡처 가능)
      const container = document.createElement('div');
      container.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 800px;
        font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 40px;
        background: white;
        color: #1a1a1a;
        box-sizing: border-box;
      `;
      document.body.appendChild(container);

      // 헤더 추가
      const header = document.createElement('div');
      header.innerHTML = `
        <div style="margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e5e5;">
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 8px 0; color: #111;">
            인사이트 분석 보고서
          </h1>
          <p style="font-size: 12px; color: #666; margin: 0;">
            생성일: ${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} | 
            총 ${selectedData.length}개 인사이트
          </p>
        </div>
      `;
      container.appendChild(header);

      // 목차 추가
      const toc = document.createElement('div');
      toc.innerHTML = `
        <div style="margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
          <h2 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #333;">목차</h2>
          <ul style="margin: 0; padding-left: 20px; font-size: 12px; line-height: 1.8; color: #555;">
            ${selectedData.map((insight, index) => `
              <li>${index + 1}. ${insight.title}${insight.brandName ? ` (${insight.brandName})` : ''}</li>
            `).join('')}
          </ul>
        </div>
      `;
      container.appendChild(toc);

      // 각 인사이트 내용 추가
      selectedData.forEach((insight, index) => {
        const section = document.createElement('div');
        section.style.cssText = `
          margin-bottom: 40px;
          page-break-inside: avoid;
        `;

        // 마크다운을 HTML로 간단 변환 (기본적인 형식만)
        const processedInsight = insight.insight
          .replace(/^### (.*?)$/gm, '<h3 style="font-size: 14px; font-weight: 600; margin: 16px 0 8px 0; color: #333;">$1</h3>')
          .replace(/^## (.*?)$/gm, '<h2 style="font-size: 16px; font-weight: 600; margin: 20px 0 10px 0; color: #222;">$1</h2>')
          .replace(/^# (.*?)$/gm, '<h1 style="font-size: 18px; font-weight: 700; margin: 24px 0 12px 0; color: #111;">$1</h1>')
          .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 600;">$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/^- (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 4px;">$1</li>')
          .replace(/^\d+\. (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 4px;">$1</li>')
          .replace(/\n\n/g, '</p><p style="margin: 12px 0; line-height: 1.7;">')
          .replace(/\n/g, '<br/>');

        section.innerHTML = `
          <div style="border: 1px solid #e5e5e5; border-radius: 12px; overflow: hidden;">
            <div style="background: #f8f9fa; padding: 16px 20px; border-bottom: 1px solid #e5e5e5;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="background: #111; color: white; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;">
                  ${index + 1}
                </span>
                <h2 style="font-size: 16px; font-weight: 600; margin: 0; color: #111;">${insight.title}</h2>
              </div>
              <div style="margin-top: 8px; display: flex; gap: 12px; font-size: 11px; color: #666;">
                ${insight.brandName ? `<span style="background: #e5e5e5; padding: 2px 8px; border-radius: 4px;">${insight.brandName}</span>` : ''}
                <span>${new Date(insight.createdAt).toLocaleDateString('ko-KR')}</span>
                <span>작성자: ${insight.createdBy || '익명'}</span>
              </div>
            </div>
            <div style="padding: 20px; font-size: 13px; color: #333; line-height: 1.7;">
              <p style="margin: 0;">${processedInsight}</p>
            </div>
          </div>
        `;
        container.appendChild(section);
      });

      // 푸터 추가
      const footer = document.createElement('div');
      footer.innerHTML = `
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center;">
          <p style="font-size: 10px; color: #999; margin: 0;">
            본 보고서는 AI 분석 시스템에 의해 자동 생성되었습니다.
          </p>
        </div>
      `;
      container.appendChild(footer);

      // PDF 옵션 설정
      const options = {
        margin: [10, 10, 10, 10],
        filename: `인사이트-보고서-${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          letterRendering: true,
          logging: false,
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait',
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };

      // DOM 렌더링 대기 후 PDF 생성
      await new Promise((resolve) => setTimeout(resolve, 100));

      // PDF 생성 및 다운로드
      await html2pdf().set(options).from(container).save();
    } catch (error) {
      console.error('PDF 내보내기 실패:', error);
    } finally {
      container.parentNode?.removeChild(container);
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6">
      <div className="w-full max-w-5xl h-[85vh] rounded-xl bg-white border border-gray-200 flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
              <LayoutGrid className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">브랜드별 요약 분석</h2>
              <p className="text-xs text-gray-500">
                {mode === 'saved' 
                  ? '저장된 인사이트를 선택하여 종합 보고서를 생성합니다'
                  : '여러 브랜드를 한 번에 분석하고 종합 인사이트를 생성합니다'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {brandInsights.length > 0 && (
              <>
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
                  전체 복사
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadAll}
                  className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-8 text-xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  다운로드
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 border-r border-gray-100 p-4 flex flex-col bg-gray-50/30">
            {/* Mode Toggle */}
            <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setMode('saved')}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'saved'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                저장된 인사이트
              </button>
              <button
                onClick={() => setMode('new')}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'new'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                새로 분석
              </button>
            </div>

            {mode === 'saved' ? (
              <>
                {/* 국가 필터 탭 */}
                <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-lg">
                  {AVAILABLE_REGIONS.map((region) => (
                    <button
                      key={region.id}
                      onClick={() => {
                        setSelectedRegion(region.id);
                        setSelectedInsights([]); // 국가 변경 시 선택 초기화
                      }}
                      className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                        selectedRegion === region.id
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <span>{region.emoji}</span>
                      {region.name}
                    </button>
                  ))}
                </div>

                {/* 저장된 인사이트 모드 */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    저장된 인사이트
                    <span className="ml-1.5 text-xs font-normal text-gray-500">
                      ({savedInsights.filter(i => (i.region || 'domestic') === selectedRegion).length}개)
                    </span>
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchSavedInsights}
                    className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInsights ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                <div className="space-y-1.5 mb-4 flex-1 overflow-y-auto">
                  {isLoadingInsights ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  ) : savedInsights.filter(i => (i.region || 'domestic') === selectedRegion).length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                      <p className="text-xs text-gray-500">저장된 인사이트가 없습니다</p>
                      <p className="text-xs text-gray-400 mt-1">AI 인사이트 생성 후 저장해주세요</p>
                    </div>
                  ) : (
                    savedInsights.filter(i => (i.region || 'domestic') === selectedRegion).map((insight) => (
                      <div
                        key={insight.id}
                        className="flex items-start gap-2 p-2.5 rounded-lg hover:bg-gray-100 transition-colors group"
                      >
                        <Checkbox
                          id={insight.id}
                          checked={selectedInsights.includes(insight.id)}
                          onCheckedChange={() => toggleInsightSelection(insight.id)}
                          className="mt-0.5 border-gray-300 data-[state=checked]:bg-gray-900 data-[state=checked]:border-gray-900"
                        />
                        <div className="flex-1 min-w-0">
                          <Label htmlFor={insight.id} className="text-xs font-medium text-gray-800 cursor-pointer block truncate">
                            {insight.title}
                          </Label>
                          {insight.brandName && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded mt-1 inline-block">
                              {insight.brandName}
                            </span>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">
                            {new Date(insight.createdAt).toLocaleDateString('ko-KR')} · {insight.createdBy}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingInsight(insight)}
                            className="h-6 w-6 p-0 text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                            title="내용 보기"
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteInsight(insight.id)}
                            className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                            title="삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 프롬프트 지침 설정 */}
                <div className="mb-3">
                  <button
                    onClick={() => setShowPromptSettings(!showPromptSettings)}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors w-full"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>분석 지침 설정</span>
                    {showPromptSettings ? (
                      <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                    )}
                  </button>
                  {showPromptSettings && (
                    <div className="mt-2">
                      <Textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="분석 시 AI에게 전달할 지침을 입력하세요..."
                        className="text-xs min-h-[100px] bg-white border-gray-200 text-gray-900 resize-none"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        예: 핵심 성과, 주요 리스크, CEO 전략 방향에 초점
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={generateSummaryFromSaved}
                    disabled={isGenerating || selectedInsights.length === 0}
                    className="flex-1 bg-gray-900 hover:bg-gray-800 text-white"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {currentStep || '요약 생성 중...'}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        {selectedInsights.length}개 요약
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={exportToPdf}
                    disabled={isExportingPdf || selectedInsights.length === 0}
                    variant="outline"
                    className="border-gray-300 text-gray-700 hover:bg-gray-100"
                    title="선택한 인사이트를 PDF로 내보내기"
                  >
                    {isExportingPdf ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileDown className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* 새로 분석 모드 */}
                <h3 className="text-sm font-semibold text-gray-900 mb-3">브랜드 선택</h3>

            <div className="space-y-1.5 mb-4 flex-1 overflow-y-auto">
              {brands.map((brand) => (
                <div
                  key={brand}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={brand}
                      checked={selectedBrands.includes(brand)}
                      onCheckedChange={() => toggleBrand(brand)}
                      className="border-gray-300 data-[state=checked]:bg-gray-900 data-[state=checked]:border-gray-900"
                    />
                    <Label htmlFor={brand} className="text-sm text-gray-700 cursor-pointer">
                      {brand}
                    </Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBrand(brand)}
                    className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="새 브랜드..."
                className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                onKeyDown={(e) => e.key === 'Enter' && addBrand()}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={addBrand}
                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 h-9 w-9 p-0"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="mb-4">
              <Label className="text-xs text-gray-500 mb-1.5 block">SQL 쿼리 템플릿</Label>
              <Textarea
                value={queryTemplate}
                onChange={(e) => setQueryTemplate(e.target.value)}
                className="text-xs h-24 bg-white border-gray-200 text-gray-900 font-mono resize-none"
              />
            </div>

            <Button
              onClick={generateBrandInsights}
              disabled={isGenerating || selectedBrands.length === 0}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {currentStep || '분석 중...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {selectedBrands.length}개 브랜드 분석
                </>
              )}
            </Button>
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {mode === 'saved' && !summary ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-gray-600 font-medium text-sm">저장된 인사이트를 선택하세요</p>
                  <p className="text-gray-400 text-xs mt-1">선택한 인사이트들을 종합한 요약 보고서를 생성합니다</p>
                </div>
              </div>
            ) : mode === 'new' && brandInsights.length === 0 && !summary ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-gray-600 font-medium text-sm">브랜드를 선택하고 분석을 시작하세요</p>
                  <p className="text-gray-400 text-xs mt-1">여러 브랜드의 인사이트를 한 번에 생성합니다</p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* 새로 분석 모드의 브랜드별 인사이트 */}
                {mode === 'new' && brandInsights.map((bi) => (
                  <div
                    key={bi.brandName}
                    className="rounded-xl bg-white border border-gray-200 p-5 card-shadow"
                  >
                    <h3 className="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
                      <span className="w-2 h-2 bg-gray-900 rounded-full" />
                      {bi.brandName}
                    </h3>
                    <article className="prose prose-sm max-w-none
                      prose-headings:text-gray-900
                      prose-p:text-gray-700
                      prose-li:text-gray-700
                      prose-strong:text-gray-900
                    ">
                      <ReactMarkdown remarkPlugins={[[remarkGfm, { strikethrough: false }]]}>
                        {bi.insight}
                      </ReactMarkdown>
                    </article>
                  </div>
                ))}

                {/* 저장된 인사이트 모드 - 선택된 인사이트 미리보기 */}
                {mode === 'saved' && selectedInsights.length > 0 && !summary && (
                  <div className="rounded-xl bg-white border border-gray-200 p-5 card-shadow">
                    <h3 className="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">
                      선택된 인사이트 ({selectedInsights.length}개)
                    </h3>
                    <div className="space-y-2">
                      {savedInsights
                        .filter((i) => selectedInsights.includes(i.id))
                        .map((insight) => (
                          <div key={insight.id} className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                            <span>{insight.title}</span>
                            {insight.brandName && (
                              <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                                {insight.brandName}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {summary && (
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        {mode === 'saved' ? '저장된 인사이트 종합 요약' : '전체 브랜드 종합 요약'}
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={saveSummaryReport}
                        disabled={isSavingReport || reportSaved}
                        className={`h-8 text-xs ${
                          reportSaved 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        {isSavingReport ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            저장 중...
                          </>
                        ) : reportSaved ? (
                          <>
                            <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                            저장됨
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5 mr-1.5" />
                            요약 보고서 저장
                          </>
                        )}
                      </Button>
                    </div>
                    <article className="prose prose-sm max-w-none
                      prose-headings:text-gray-900
                      prose-p:text-gray-700
                      prose-li:text-gray-700
                      prose-strong:text-gray-900
                    ">
                      <ReactMarkdown remarkPlugins={[[remarkGfm, { strikethrough: false }]]}>
                        {summary.insight}
                      </ReactMarkdown>
                    </article>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 인사이트 상세보기 모달 */}
      {viewingInsight && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-6">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-xl bg-white border border-gray-200 flex flex-col overflow-hidden shadow-2xl">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="text-base font-bold text-gray-900 truncate">{viewingInsight.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {viewingInsight.brandName && (
                    <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                      {viewingInsight.brandName}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {new Date(viewingInsight.createdAt).toLocaleDateString('ko-KR')} · {viewingInsight.createdBy}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewingInsight(null)}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 h-8 w-8 p-0 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* 모달 콘텐츠 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 인사이트 내용 */}
              <article className="prose prose-sm max-w-none
                prose-headings:text-gray-900 prose-headings:font-semibold
                prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                prose-p:text-gray-700 prose-p:leading-relaxed
                prose-li:text-gray-700 prose-li:marker:text-gray-400
                prose-strong:text-gray-900 prose-strong:font-semibold
                prose-table:border-collapse prose-table:w-full
                prose-th:bg-gray-50 prose-th:text-gray-700 prose-th:px-4 prose-th:py-2 prose-th:border prose-th:border-gray-200 prose-th:text-left prose-th:font-semibold prose-th:text-sm
                prose-td:px-4 prose-td:py-2 prose-td:border prose-td:border-gray-200 prose-td:text-gray-700 prose-td:text-sm
              ">
                <ReactMarkdown remarkPlugins={[[remarkGfm, { strikethrough: false }]]}>
                  {viewingInsight.insight}
                </ReactMarkdown>
              </article>

              {/* 분석 요청 프롬프트 */}
              {viewingInsight.analysisRequest && (
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    분석 요청 프롬프트
                  </h4>
                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                    <p className="text-sm text-purple-900 whitespace-pre-wrap">{viewingInsight.analysisRequest}</p>
                  </div>
                </div>
              )}

              {/* SQL 쿼리 */}
              {viewingInsight.query && (
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      사용된 SQL 쿼리
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsQueryCollapsed(!isQueryCollapsed)}
                      className="h-6 text-xs text-gray-500 hover:text-gray-700"
                    >
                      {isQueryCollapsed ? (
                        <>
                          <ChevronDown className="w-3 h-3 mr-1" />
                          펼치기
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-3 h-3 mr-1" />
                          접기
                        </>
                      )}
                    </Button>
                  </div>
                  {!isQueryCollapsed && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-[200px] overflow-y-auto">
                      <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap">{viewingInsight.query}</pre>
                    </div>
                  )}
                  {isQueryCollapsed && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                      <p className="text-xs text-gray-500 truncate">{viewingInsight.query.split('\n')[0]}...</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
              <span className="text-xs text-gray-400">
                {viewingInsight.tokensUsed.toLocaleString()} 토큰 · {viewingInsight.model}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewingInsight(null)}
                className="text-gray-600 border-gray-200"
              >
                닫기
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
