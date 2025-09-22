import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('PumpFun API')
    .setDescription('API for interacting with Pump.fun and PumpSwap services')
    .setVersion('1.0')
    .addTag('pump-fun', 'Endpoints for interacting with Pump.fun')
    .addTag('pump-swap', 'Endpoints for interacting with PumpSwap')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
