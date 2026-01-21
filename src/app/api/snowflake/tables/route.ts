import { NextResponse } from 'next/server';
import { createSnowflakeConnection } from '@/lib/snowflake';

interface SnowflakeRow {
  TABLE_NAME?: string;
  name?: string;
}

export async function GET() {
  try {
    // 환경 변수 확인
    if (!process.env.SNOWFLAKE_ACCOUNT || !process.env.SNOWFLAKE_USER) {
      return NextResponse.json({
        success: true,
        tables: [],
        message: 'Snowflake 환경 변수가 설정되지 않았습니다.',
      });
    }

    const connection = await createSnowflakeConnection();

    return new Promise<NextResponse>((resolve) => {
      connection.execute({
        sqlText: 'SHOW TABLES',
        complete: (err, _stmt, rows) => {
          connection.destroy(() => {});

          if (err) {
            resolve(
              NextResponse.json(
                { error: `테이블 목록 조회 실패: ${err.message}` },
                { status: 500 }
              )
            );
            return;
          }

          const tableRows = (rows || []) as SnowflakeRow[];
          const tables = tableRows.map(
            (row) => row.name || row.TABLE_NAME || ''
          ).filter(Boolean);

          resolve(
            NextResponse.json({
              success: true,
              tables,
            })
          );
        },
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
