import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SavedRepliesService } from './saved-replies.service';
import { SavedRepliesResolver } from './saved-replies.resolver';

@Module({
  imports: [PrismaModule],
  providers: [SavedRepliesService, SavedRepliesResolver],
})
export class SavedRepliesModule {}
