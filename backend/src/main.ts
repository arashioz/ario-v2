import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

/** In production the built frontend is served from the same port; the SPA owns every non-API path. */
function serveFrontend(app: NestExpressApplication, dir: string, logger: Logger) {
  const index = join(dir, 'index.html');
  if (!existsSync(index)) {
    logger.warn(`STATIC_DIR ${dir} has no index.html — frontend not served`);
    return;
  }
  app.useStaticAssets(dir, {
    index: false,
    setHeaders: (res, path) => {
      res.setHeader(
        'Cache-Control',
        /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  app.use((req: any, res: any, next: any) => {
    if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  logger.log(`Serving frontend from ${dir}`);
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3001;

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Confirm-Password'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const staticDir = configService.get<string>('STATIC_DIR');
  if (staticDir) serveFrontend(app, staticDir, logger);

  await app.listen(port, '0.0.0.0');
  logger.log(`Ario Backend is running on: http://0.0.0.0:${port}/api`);
}

bootstrap();
