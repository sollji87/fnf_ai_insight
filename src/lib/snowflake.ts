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
      throw new Error('Snowflake SDK瑜?濡쒕뱶?????놁뒿?덈떎. ?섍꼍 蹂?섎? ?뺤씤?댁＜?몄슂.');
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
        reject(new Error(`?ㅻ끂?고뵆?덉씠???곌껐 ?ㅽ뙣: ${err.message}`));
        return;
      }
      resolve(connection as unknown as SnowflakeConnection);
    });
  });
}

export async function executeQuery(query: string): Promise<QueryResult> {
  const startTime = Date.now();
  
  // ?섍꼍 蹂???뺤씤
  if (!process.env.SNOWFLAKE_ACCOUNT || !process.env.SNOWFLAKE_USER) {
    throw new Error('Snowflake ?섍꼍 蹂?섍? ?ㅼ젙?섏? ?딆븯?듬땲?? .env.local ?뚯씪???뺤씤?댁＜?몄슂.');
  }
  
  const connection = await createSnowflakeConnection();

  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: query,
      complete: (err, _stmt, rows) => {
        connection.destroy(() => {});

        if (err) {
          reject(new Error(`荑쇰━ ?ㅽ뻾 ?ㅽ뙣: ${err.message}`));
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


const MONEY_COLUMN_PATTERN = /(amt|sale|prft|profit|cost|cms|rent|rnt|cogs|margin|revenue|dprft|oprt|gross)/i;
const LARGE_DATA_ROW_THRESHOLD = 120;
const LARGE_DATA_BASE_CELL_THRESHOLD = 1800;
const LARGE_DATA_EXPANDED_CELL_THRESHOLD = 2600;

function isMonetaryColumn(columnName: string): boolean {
  return MONEY_COLUMN_PATTERN.test(columnName);
}

function formatMilKrw(value: number): string {
  return (value / 1_000_000).toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function shouldUseMilOnlyMode(result: QueryResult, monetaryColumnCount: number): boolean {
  const rowCount = result.rows.length;
  const baseColumnCount = result.columns.length;
  const baseCells = rowCount * baseColumnCount;
  const expandedCells = rowCount * (baseColumnCount + monetaryColumnCount);

  return (
    rowCount >= LARGE_DATA_ROW_THRESHOLD ||
    baseCells >= LARGE_DATA_BASE_CELL_THRESHOLD ||
    expandedCells >= LARGE_DATA_EXPANDED_CELL_THRESHOLD
  );
}

export function formatQueryResultForPrompt(result: QueryResult): string {
  if (result.rows.length === 0) {
    return '?곗씠?곌? ?놁뒿?덈떎.';
  }

  const monetaryColumnCount = result.columns.filter(isMonetaryColumn).length;
  const useMilOnlyMode = shouldUseMilOnlyMode(result, monetaryColumnCount);

  const expandedColumns = result.columns.flatMap((col) => {
    if (!isMonetaryColumn(col)) {
      return [{ source: col, label: col, unit: 'plain' as const }];
    }

    if (useMilOnlyMode) {
      return [{ source: col, label: `${col}_MIL_KRW`, unit: 'mil' as const }];
    }

    return [
      { source: col, label: `${col}_KRW`, unit: 'krw' as const },
      { source: col, label: `${col}_MIL_KRW`, unit: 'mil' as const },
    ];
  });

  const headers = expandedColumns.map((col) => col.label).join(' | ');
  const separator = expandedColumns.map(() => '---').join(' | ');
  const rows = result.rows
    .map((row) =>
      '| ' + expandedColumns.map((col) => {
        const value = row[col.source];
        if (typeof value === 'number') {
          if (col.unit === 'mil') {
            return formatMilKrw(value);
          }
          return value.toLocaleString('ko-KR');
        }
        return String(value ?? '');
      }).join(' | ') + ' |'
    )
    .join('\n');

  const unitRule = useMilOnlyMode
    ? '[단위 규칙] 대용량 모드: 금액 컬럼은 *_MIL_KRW(백만원)만 제공 (토큰 절감)'
    : '[단위 규칙] *_KRW=원, *_MIL_KRW=백만원';

  return `${unitRule}\n\n| ${headers} |\n| ${separator} |\n${rows}`;
}

// ?뚯씠釉?紐⑸줉 媛?몄삤湲?
export async function getTableList(): Promise<string[]> {
  const connection = await createSnowflakeConnection();

  return new Promise((resolve, reject) => {
    const query = `SHOW TABLES IN SCHEMA ${process.env.SNOWFLAKE_DATABASE}.${process.env.SNOWFLAKE_SCHEMA}`;

    connection.execute({
      sqlText: query,
      complete: (err, _stmt, rows) => {
        connection.destroy(() => {});

        if (err) {
          reject(new Error(`?뚯씠釉?紐⑸줉 議고쉶 ?ㅽ뙣: ${err.message}`));
          return;
        }

        const tables = (rows || []).map((row) => {
          // SHOW TABLES??'name' 而щ읆???뚯씠釉??대쫫???덉뒿?덈떎
          return String(row['name'] || '');
        }).filter(Boolean);

        resolve(tables);
      },
    });
  });
}

// ?뱀젙 ?뚯씠釉붿쓽 ?ㅽ궎留??뺣낫 媛?몄삤湲?
export async function getTableSchema(tableName: string): Promise<string> {
  const connection = await createSnowflakeConnection();

  return new Promise((resolve, reject) => {
    const query = `DESCRIBE TABLE ${tableName}`;

    connection.execute({
      sqlText: query,
      complete: (err, _stmt, rows) => {
        connection.destroy(() => {});

        if (err) {
          reject(new Error(`?뚯씠釉??ㅽ궎留?議고쉶 ?ㅽ뙣: ${err.message}`));
          return;
        }

        if (!rows || rows.length === 0) {
          resolve('?뚯씠釉??뺣낫瑜?李얠쓣 ???놁뒿?덈떎.');
          return;
        }

        // ?ㅽ궎留??뺣낫瑜??쎄린 ?ъ슫 ?뺤떇?쇰줈 蹂??
        const schemaText = rows.map((row) => {
          const name = row['name'] || '';
          const type = row['type'] || '';
          const nullable = row['null?'] === 'Y' ? 'NULL' : 'NOT NULL';
          const comment = row['comment'] ? ` -- ${row['comment']}` : '';
          return `  ${name} ${type} ${nullable}${comment}`;
        }).join('\n');

        resolve(`?뚯씠釉? ${tableName}\n而щ읆:\n${schemaText}`);
      },
    });
  });
}

// ?щ윭 ?뚯씠釉붿쓽 ?ㅽ궎留??뺣낫 媛?몄삤湲?
export async function getMultipleTableSchemas(tableNames: string[]): Promise<string> {
  const schemas = await Promise.all(
    tableNames.map(async (tableName) => {
      try {
        return await getTableSchema(tableName);
      } catch (error) {
        return `?뚯씠釉?${tableName}: ?ㅽ궎留?議고쉶 ?ㅽ뙣`;
      }
    })
  );

  return schemas.join('\n\n---\n\n');
}

