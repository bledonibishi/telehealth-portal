import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    // Preserve raw body for Stripe webhook signature verification
    rawBody: true,
  });
  const config = app.get(ConfigService);

  const allowedOrigins = config.get<string>('ALLOWED_ORIGINS', 'http://localhost:3000').split(',');
  app.enableCors({ origin: allowedOrigins, credentials: true });

  return app;
}
