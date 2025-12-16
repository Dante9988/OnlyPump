import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { setupSwagger } from './api/swagger.config';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './api/filters/http-exception.filter';
import { setupBigIntSerialization } from './utils/bigint-serializer';

async function bootstrap() {
  // Set up BigInt serialization before anything else
  const cleanupBigIntSerialization = setupBigIntSerialization();
  
  // Enable rawBody so XRequestSignatureGuard can reliably hash the exact JSON payload
  // (prevents subtle stringify/ordering differences between client and server).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  
  // Enable CORS
  app.enableCors();
  
  // Set up global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  
  // Set up global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());
  
  // Set up Swagger documentation
  setupSwagger(app);
  
  // Get port from config
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation is available at: http://localhost:${port}/api/docs`);
  
  // Handle cleanup when application shuts down
  app.enableShutdownHooks();
  process.on('SIGINT', () => {
    cleanupBigIntSerialization();
    process.exit(0);
  });
}
bootstrap();
