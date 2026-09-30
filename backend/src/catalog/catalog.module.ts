import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogResolver } from './catalog.resolver';

@Module({
  providers: [CatalogService, CatalogResolver],
  exports: [CatalogService],
})
export class CatalogModule {}
