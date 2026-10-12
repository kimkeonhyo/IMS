import { Module } from '@nestjs/common';
import { NotionCatalogController } from './notion-catalog.controller';
import { NotionCatalogService } from './notion-catalog.service';

@Module({
  controllers: [NotionCatalogController],
  providers: [NotionCatalogService],
})
export class NotionCatalogModule {}
