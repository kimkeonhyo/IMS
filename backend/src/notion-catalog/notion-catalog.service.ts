import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@notionhq/client';

// ── Notion database IDs (환경변수로 주입) ──
const DB_BUNDLE = process.env.NOTION_DB_BUNDLE ?? '';
const DB_FE = process.env.NOTION_DB_FRONTEND ?? '';
const DB_BE = process.env.NOTION_DB_BACKEND ?? '';
const DB_ES = process.env.NOTION_DB_EMBEDDED ?? '';
const DB_MEDIA = process.env.NOTION_DB_MEDIA ?? '';

// Manual 배포용 이미지 계층 (group → 이미지). match: 컴포넌트 DB Name 필터 키워드
// Frontend/MediaMTX는 하위 없음(단일), Backend/Embedded는 하위 컴포넌트로 분리. Transcode/Delivery 제외.
const IMAGE_SPECS: Array<{ group: string; image: string; databaseId: string; match?: string }> = [
  { group: 'Frontend', image: 'Frontend',    databaseId: DB_FE },
  { group: 'Backend',  image: 'api-gateway', databaseId: DB_BE, match: 'api-gateway' },
  { group: 'Backend',  image: 'auth',        databaseId: DB_BE, match: 'auth' },
  { group: 'Backend',  image: 'camera',      databaseId: DB_BE, match: 'camera' },
  { group: 'Backend',  image: 'event',       databaseId: DB_BE, match: 'event' },
  { group: 'Embedded', image: 'inference',   databaseId: DB_ES, match: 'inference' },
  { group: 'Embedded', image: 'decoder',     databaseId: DB_ES, match: 'decoder' },
  { group: 'Embedded', image: 'es-gateway',  databaseId: DB_ES, match: 'gateway' },
  { group: 'MediaMTX', image: 'MediaMTX',    databaseId: DB_MEDIA, match: 'mediamtx' },
];

// bundle "components" text columns to surface
const BUNDLE_COMPONENT_COLS = [
  'Frontend', 'Auth', 'Gateway', 'API Gateway', 'Inference',
  'MediaMTX', 'Transcode', 'Camera', 'Decoder', 'Event',
];

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface BundleDto {
  name: string;
  applied_sites: string[];
  components: Record<string, string>;
}
export interface ImageDto {
  group: string;
  image: string;
  versions: string[];
}

interface CacheEntry<T> {
  ts: number;
  data: T;
}

@Injectable()
export class NotionCatalogService {
  private readonly logger = new Logger(NotionCatalogService.name);
  private readonly client: Client | null;
  private cache: {
    bundles?: CacheEntry<BundleDto[]>;
    images?: CacheEntry<ImageDto[]>;
  } = {};

  constructor() {
    const token = process.env.NOTION_TOKEN;
    this.client = token && token.trim() ? new Client({ auth: token }) : null;
  }

  private get configured(): boolean {
    return this.client !== null;
  }

  // ── property extractors ──
  private extractTitle(prop: any): string {
    if (!prop || !Array.isArray(prop.title)) return '';
    return prop.title.map((t: any) => t.plain_text ?? '').join('').trim();
  }
  private extractRichText(prop: any): string {
    if (!prop || !Array.isArray(prop.rich_text)) return '';
    return prop.rich_text.map((t: any) => t.plain_text ?? '').join('').trim();
  }
  private extractMultiSelect(prop: any): string[] {
    if (!prop || !Array.isArray(prop.multi_select)) return [];
    return prop.multi_select.map((o: any) => o.name).filter(Boolean);
  }

  // resolved data source id cache (database id → first data source id)
  private dataSourceIdCache: Record<string, string> = {};

  /** Resolve the first data source id for a database (Notion API 2025-09-03+). */
  private async resolveDataSourceId(databaseId: string): Promise<string> {
    if (this.dataSourceIdCache[databaseId]) return this.dataSourceIdCache[databaseId];
    const db: any = await this.client!.databases.retrieve({ database_id: databaseId });
    const dsId: string = db?.data_sources?.[0]?.id ?? databaseId;
    this.dataSourceIdCache[databaseId] = dsId;
    return dsId;
  }

  /** Query a database, following pagination (capped) and sorting newest first by created_time. */
  private async queryDatabase(databaseId: string): Promise<any[]> {
    if (!this.client) return [];
    const dataSourceId = await this.resolveDataSourceId(databaseId);
    const results: any[] = [];
    let cursor: string | undefined = undefined;
    let pages = 0;
    const MAX_PAGES = 3;
    do {
      const resp: any = await this.client.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      });
      results.push(...(resp.results ?? []));
      cursor = resp.has_more ? resp.next_cursor : undefined;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);
    return results;
  }

  async getBundles(): Promise<{ configured: boolean; bundles: BundleDto[] }> {
    if (!this.configured) return { configured: false, bundles: [] };

    const cached = this.cache.bundles;
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { configured: true, bundles: cached.data };
    }

    let bundles: BundleDto[] = [];
    try {
      const rows = await this.queryDatabase(DB_BUNDLE);
      bundles = rows.map((row) => {
        const props = row.properties ?? {};
        const name = this.extractTitle(props['Name']);
        const applied_sites = this.extractMultiSelect(props['Applied Sites']);
        const components: Record<string, string> = {};
        for (const col of BUNDLE_COMPONENT_COLS) {
          const val = this.extractRichText(props[col]);
          if (val) components[col] = val;
        }
        return { name, applied_sites, components };
      });
      this.cache.bundles = { ts: Date.now(), data: bundles };
    } catch (err) {
      this.logger.error(`getBundles failed: ${(err as Error)?.message ?? err}`);
      bundles = [];
    }
    return { configured: true, bundles };
  }

  async getImages(): Promise<{ configured: boolean; images: ImageDto[] }> {
    if (!this.configured) return { configured: false, images: [] };

    const cached = this.cache.images;
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { configured: true, images: cached.data };
    }

    let images: ImageDto[] = [];
    try {
      // 각 컴포넌트 DB의 Name 목록을 1회씩만 조회 후, 스펙별로 필터링
      const uniqueDbs = [...new Set(IMAGE_SPECS.map((s) => s.databaseId))];
      const namesByDb: Record<string, string[]> = {};
      for (const db of uniqueDbs) {
        const rows = await this.queryDatabase(db);
        const seen = new Set<string>();
        const names: string[] = [];
        for (const row of rows) {
          const name = this.extractTitle((row.properties ?? {})['Name']);
          if (!name || seen.has(name)) continue;
          seen.add(name);
          names.push(name);
        }
        namesByDb[db] = names;
      }
      images = IMAGE_SPECS.map((spec) => {
        let versions = namesByDb[spec.databaseId] ?? [];
        if (spec.match) {
          const kw = spec.match.toLowerCase();
          versions = versions.filter((n) => n.toLowerCase().includes(kw));
        }
        return { group: spec.group, image: spec.image, versions };
      });
      this.cache.images = { ts: Date.now(), data: images };
    } catch (err) {
      this.logger.error(`getImages failed: ${(err as Error)?.message ?? err}`);
      return { configured: true, images: [] };
    }
    return { configured: true, images };
  }
}
