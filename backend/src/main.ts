import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { createApp } from './create-app';

async function bootstrap() {
  const app = await createApp();
  const config = app.get(ConfigService);

  const port = config.get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`Backend running on http://localhost:${port}/graphql`);
}

bootstrap();
