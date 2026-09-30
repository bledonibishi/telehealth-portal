import { Module } from '@nestjs/common';
import { QuestionnairesResolver } from './questionnaires.resolver';

@Module({
  providers: [QuestionnairesResolver],
})
export class QuestionnairesModule {}
