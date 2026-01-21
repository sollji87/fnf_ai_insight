import type { QueryResult } from '@/types';

interface SnowflakeConnection {
  execute: (options: {
    sqlText: string;
    complete: (err: Error | undefined, stmt: unknown, rows: Record<string, unknown>[] | undefined) => void;
  }) => void;
  destroy: (callback: (err: Error | undefined) => void) => void;
}

let snowflake: typeof import('snowflake-sdk') | null = null;

async function getSnowflakeSDK() {
  if (!snowflake) {
    try {
      snowflake = await import('snowflake-sdk');
    } catch {
      throw new Error('Snowflake SDK를 로드할 수 없습니다. 환경 변수를 확인해주세요.');
    }
  }
  return snowflake;
}

export async function createSnowflakeConnection(): Promise<SnowflakeConnection> {
  const sdk = await getSnowflakeSDK();
  
  return new Promise((resolve, reject) => {
    const connection = sdk.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT || '',
      username: process.env.SNOWFLAKE_USER || '',
      password: process.env.SNOWFLAKE_PASSWORD || '',
      database: process.env.SNOWFLAKE_DATABASE || '',
      schema: process.env.SNOWFLAKE_SCHEMA || '',
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || '',
    });

    connection.connect((err) => {
      if (err) {
        reject(new Error(`스노우플레이크 연결 실패: ${err.message}`));
        return;
      }
      resolve(connection as unknown as SnowflakeConnection);
    });
  });
}

export async function executeQuery(query: string): Promise<QueryResult> {
  const startTime = Date.now();
  
  // 환경 변수 확인
  if (!process.env.SNOWFLAKE_ACCOUNT || !process.env.SNOWFLAKE_USER) {
    throw new Error('Snowflake 환경 변수가 설정되지 않았습니다. .env.local 파일을 확인해주세요.');
  }
  
  const connection = await createSnowflakeConnection();

  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: query,
      complete: (err, _stmt, rows) => {
        connection.destroy(() => {});

        if (err) {
          reject(new Error(`쿼리 실행 실패: ${err.message}`));
          return;
        }

        const executionTime = Date.now() - startTime;
        const resultRows = rows || [];
        const columns = resultRows.length > 0 ? Object.keys(resultRows[0]) : [];

        resolve({
          columns,
          rows: resultRows,
          rowCount: resultRows.length,
          executionTime,
        });
      },
    });
  });
}

export function formatQueryResultForPrompt(result: QueryResult): string {
  if (result.rows.length === 0) {
    return '데이터가 없습니다.';
  }

  const headers = result.columns.join(' | ');
  const separator = result.columns.map(() => '---').join(' | ');
  const rows = result.rows
    .map((row) =>
      '| ' + result.columns.map((col) => {
        const value = row[col];
        if (typeof value === 'number') {
          return value.toLocaleString('ko-KR');
        }
        return String(value ?? '');
      }).join(' | ') + ' |'
    )
    .join('\n');

  return `| ${headers} |\n| ${separator} |\n${rows}`;
}
