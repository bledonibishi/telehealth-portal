import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmTracingService } from './llm-tracing.service';

@Global()
@Module({
  providers: [{ provide: LlmTracingService, inject: [ConfigService], useFactory: (config: ConfigService) => new LlmTracingService(config) }],
  exports: [LlmTracingService],
})
export class LangfuseModule {}
