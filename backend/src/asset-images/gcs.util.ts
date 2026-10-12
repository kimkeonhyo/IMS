import { Storage } from '@google-cloud/storage';

/** VM 서비스 계정의 ADC를 사용 — 키 파일 없음. 버킷명은 Terraform이 .env에 주입한다. */
let cached: Storage | null = null;

function client(): Storage {
  if (!cached) cached = new Storage();
  return cached;
}

export function bucketName(): string | null {
  const b = process.env.GCS_ASSET_BUCKET;
  return b && b.trim() ? b.trim() : null;
}

export function gcsConfigured(): boolean {
  return bucketName() !== null;
}

export async function uploadObject(path: string, body: Buffer, contentType: string): Promise<void> {
  const bucket = bucketName();
  if (!bucket) throw new Error('GCS_ASSET_BUCKET이 설정되지 않았습니다');
  await client().bucket(bucket).file(path).save(body, {
    contentType,
    // 비공개 버킷 — 앱(백엔드)을 통해서만 제공하므로 캐시는 짧게
    metadata: { cacheControl: 'private, max-age=300' },
  });
}

export async function downloadObject(path: string): Promise<Buffer> {
  const bucket = bucketName();
  if (!bucket) throw new Error('GCS_ASSET_BUCKET이 설정되지 않았습니다');
  const [buf] = await client().bucket(bucket).file(path).download();
  return buf;
}

/** 삭제는 실패해도 앱 흐름을 막지 않는다 (DB 레코드가 정본, 객체는 lifecycle로도 정리됨) */
export async function deleteObject(path: string): Promise<void> {
  const bucket = bucketName();
  if (!bucket) return;
  await client().bucket(bucket).file(path).delete({ ignoreNotFound: true });
}
