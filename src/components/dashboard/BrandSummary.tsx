'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { SAMPLE_BRANDS, SAMPLE_QUERY_TEMPLATES, SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE } from '@/lib/prompts';
import type { BrandInsight, InsightResponse } from '@/types';

interface BrandSummaryProps {
  onClose: () => void;
}

export function BrandSummary({ onClose }: BrandSummaryProps) {
  const [brands, setBrands] = useState<string[]>(SAMPLE_BRANDS);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const [brandInsights, setBrandInsights] = useState<BrandInsight[]>([]);
  const [summary, setSummary] = useState<InsightResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [queryTemplate, setQueryTemplate] = useState(SAMPLE_QUERY_TEMPLATES[0].query);

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
              <p className="text-xs text-gray-500">여러 브랜드를 한 번에 분석하고 종합 인사이트를 생성합니다</p>
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
          <div className="w-64 border-r border-gray-100 p-4 flex flex-col bg-gray-50/30">
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
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {brandInsights.length === 0 && !summary ? (
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
                {brandInsights.map((bi) => (
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {bi.insight}
                      </ReactMarkdown>
                    </article>
                  </div>
                ))}

                {summary && (
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-3 pb-2 border-b border-gray-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      전체 브랜드 종합 요약
                    </h3>
                    <article className="prose prose-sm max-w-none
                      prose-headings:text-gray-900
                      prose-p:text-gray-700
                      prose-li:text-gray-700
                      prose-strong:text-gray-900
                    ">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
    </div>
  );
}
