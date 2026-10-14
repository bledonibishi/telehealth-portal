import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { TicketsModule } from '../tickets/tickets.module';
import { SupportBotService } from './support-bot.service';
import { SupportArticlesService } from './support-articles.service';
import { AssistantReviewService } from './assistant-review.service';
import { AssistantResolver } from './assistant.resolver';
import { SupportBotCronController } from './support-bot-cron.controller';

@Module({
  imports: [PrismaModule, AiModule, TicketsModule],
  controllers: [SupportBotCronController],
  providers: [SupportBotService, SupportArticlesService, AssistantReviewService, AssistantResolver],
  exports: [SupportBotService, SupportArticlesService],
})
export class SupportBotModule {}
