'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { FileText, Copy, Download, Check, Clock, Coins, Cpu } from 'lucide-react';
import type { InsightResponse } from '@/types';

interface InsightViewerProps {
  insightResponse: InsightResponse | null;
}

export function InsightViewer({ insightResponse }: InsightViewerProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    if (!insightResponse?.insight) return;

    await navigator.clipboard.writeText(insightResponse.insight);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    if (!insightResponse?.insight) return;

    const blob = new Blob([insightResponse.insight], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insight-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {insightResponse.insight}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
