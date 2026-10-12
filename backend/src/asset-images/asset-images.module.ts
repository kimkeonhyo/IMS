import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetImage } from './asset-image.entity';
import { AssetImagesController } from './asset-images.controller';
import { AssetImagesService } from './asset-images.service';

@Module({
  imports: [TypeOrmModule.forFeature([AssetImage])],
  controllers: [AssetImagesController],
  providers: [AssetImagesService],
  exports: [AssetImagesService],
})
export class AssetImagesModule {}
