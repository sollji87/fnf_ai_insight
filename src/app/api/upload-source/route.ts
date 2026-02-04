import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

interface ProcessedFile {
  name: string;
  type: 'excel' | 'image' | 'text' | 'pdf';
  content: string; // 텍스트 내용 또는 이미지 base64
  preview?: string; // 미리보기용 짧은 텍스트
}

// 엑셀 파일을 텍스트로 변환
function parseExcel(buffer: ArrayBuffer, fileName: string): string {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const results: string[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

      if (jsonData.length === 0) return;

      results.push(`\n## 시트: ${sheetName}\n`);

      // 헤더와 데이터를 마크다운 테이블로 변환
      const headers = jsonData[0] as string[];
      if (headers && headers.length > 0) {
        // 테이블 헤더
        results.push('| ' + headers.map(h => String(h || '')).join(' | ') + ' |');
        results.push('| ' + headers.map(() => '---').join(' | ') + ' |');

        // 테이블 데이터 (최대 100행)
        const dataRows = jsonData.slice(1, 101);
        dataRows.forEach((row) => {
          const rowData = headers.map((_, idx) => String((row as unknown[])[idx] ?? ''));
          results.push('| ' + rowData.join(' | ') + ' |');
        });

        if (jsonData.length > 101) {
          results.push(`\n... (총 ${jsonData.length - 1}개 행 중 100개만 표시)`);
        }
      }
    });

    return `# 엑셀 파일: ${fileName}\n${results.join('\n')}`;
  } catch (error) {
    console.error('Excel parsing error:', error);
    throw new Error('엑셀 파일 파싱에 실패했습니다.');
  }
}

// 이미지를 base64로 변환
function imageToBase64(buffer: ArrayBuffer, mimeType: string): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

// 텍스트 파일 읽기
function parseTextFile(buffer: ArrayBuffer, fileName: string): string {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(buffer);
  return `# 텍스트 파일: ${fileName}\n\n${text}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: '파일이 없습니다.' },
        { status: 400 }
      );
    }

    const processedFiles: ProcessedFile[] = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const fileName = file.name;
      const mimeType = file.type;

      // 파일 타입에 따른 처리
      if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xls')
      ) {
        // 엑셀 파일
        const content = parseExcel(buffer, fileName);
        processedFiles.push({
          name: fileName,
          type: 'excel',
          content,
          preview: content.slice(0, 200) + '...',
        });
      } else if (mimeType.startsWith('image/')) {
        // 이미지 파일
        const base64 = imageToBase64(buffer, mimeType);
        processedFiles.push({
          name: fileName,
          type: 'image',
          content: base64,
          preview: `[이미지: ${fileName}]`,
        });
      } else if (
        mimeType === 'text/plain' ||
        mimeType === 'text/csv' ||
        fileName.endsWith('.txt') ||
        fileName.endsWith('.csv') ||
        fileName.endsWith('.md')
      ) {
        // 텍스트 파일
        const content = parseTextFile(buffer, fileName);
        processedFiles.push({
          name: fileName,
          type: 'text',
          content,
          preview: content.slice(0, 200) + '...',
        });
      } else if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
        // PDF 파일 - 기본 안내 메시지 (PDF 파싱은 추가 라이브러리 필요)
        processedFiles.push({
          name: fileName,
          type: 'pdf',
          content: `[PDF 파일: ${fileName}] - PDF 텍스트 추출은 현재 지원되지 않습니다. 이미지로 변환하여 업로드해주세요.`,
          preview: `[PDF: ${fileName}]`,
        });
      } else {
        // 지원하지 않는 파일 형식
        return NextResponse.json(
          { success: false, error: `지원하지 않는 파일 형식입니다: ${fileName}` },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      files: processedFiles,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '파일 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
