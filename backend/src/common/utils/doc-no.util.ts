import { DataSource, EntityManager } from 'typeorm';

/**
 * 문서번호 생성: PREFIX-YYYYMMDD-0001 형태
 * 같은 날짜의 마지막 번호를 조회하여 +1
 *
 * bulk 등록처럼 단일 트랜잭션 안에서 여러 번 호출하는 경우,
 * EntityManager를 넘기면 트랜잭션 내부에서 이미 INSERT된 행을
 * 포함해 조회하므로 중복 없이 시퀀스를 증가시킨다.
 */
export async function generateDocNo(
  ds: DataSource | EntityManager,
  tableName: string,
  pkColumn: string,
  prefix: string,
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const pattern = `${prefix}-${dateStr}-%`;

  const result = await ds.query(
    `SELECT "${pkColumn}" FROM "${tableName}" WHERE "${pkColumn}" LIKE $1 ORDER BY "${pkColumn}" DESC LIMIT 1`,
    [pattern],
  );

  let seq = 1;
  if (result.length > 0) {
    const last: string = result[0][pkColumn];
    seq = parseInt(last.split('-').pop() || '0', 10) + 1;
  }

  return `${prefix}-${dateStr}-${String(seq).padStart(4, '0')}`;
}
