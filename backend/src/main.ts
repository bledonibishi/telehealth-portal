import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const allowedOrigins = config.get<string>('ALLOWED_ORIGINS', 'http://localhost:3000').split(',');
  app.enableCors({ origin: allowedOrigins, credentials: true });

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}/graphql`);
}

bootstrap();
