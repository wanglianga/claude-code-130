import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, transform: true,
    exceptionFactory: (errors) => new BadRequestException(
      errors.map(e => Object.values(e.constraints || {}).join(';')).filter(Boolean).join('; ') || '参数错误',
    ),
  }));
  await app.listen(config.port, '0.0.0.0');
  console.log(`[pet-memorial-server] listening on http://0.0.0.0:${config.port}`);
}
bootstrap();
