import { NextResponse } from 'next/server';
import { getTableList } from '@/lib/snowflake';

export async function GET() {
  try {
    const tables = await getTableList();

    return NextResponse.json({
      success: true,
      tables,
    });
  } catch (error) {
    console.error('Table list error:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
