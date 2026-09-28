import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Preserve raw body for Stripe webhook signature verification
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Vercel's proxy sets X-Forwarded-For to the client IP. Without this, req.ip is the proxy
  // address, so every client shares one per-IP login limit.
  app.set('trust proxy', 1);

  const allowedOrigins = config.get<string>('ALLOWED_ORIGINS', 'http://localhost:3000').split(',');
  app.enableCors({ origin: allowedOrigins, credentials: true });

  return app;
}
