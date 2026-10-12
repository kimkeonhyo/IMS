import client from './client';

export interface NotionBundle {
  name: string;
  applied_sites: string[];
  components: Record<string, string>;
}

export interface NotionBundlesResponse {
  configured: boolean;
  bundles: NotionBundle[];
}

export interface NotionImage {
  group: string;
  image: string;
  versions: string[];
}

export interface NotionImagesResponse {
  configured: boolean;
  images: NotionImage[];
}

export const notionCatalogApi = {
  getBundles: () => client.get<NotionBundlesResponse>('/notion/bundles').then(r => r.data),
  getImages: () => client.get<NotionImagesResponse>('/notion/images').then(r => r.data),
};
