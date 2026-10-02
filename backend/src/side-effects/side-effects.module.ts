import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SideEffectsService } from './side-effects.service';
import { SideEffectsResolver } from './side-effects.resolver';

@Module({
  imports: [PrismaModule],
  providers: [SideEffectsService, SideEffectsResolver],
})
export class SideEffectsModule {}
