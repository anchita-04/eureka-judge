import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './platform/api-error.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiErrorFilter());
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
