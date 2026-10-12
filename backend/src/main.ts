import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'oidc/callback', method: RequestMethod.GET }],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // ── Swagger ─────────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('IMS API')
    .setDescription('IMS 재고관리 시스템 REST API 문서')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .addTag('auth',             '인증 (로그인 / 내 정보)')
    .addTag('items',            '품목 관리')
    .addTag('storage',          '창고 관리')
    .addTag('employees',        '직원 관리')
    .addTag('teams',            '팀 관리')
    .addTag('purchase-requests','구매요청')
    .addTag('purchase-orders',  '발주 관리')
    .addTag('store',            '입고 관리')
    .addTag('shipments',        '납품 관리')
    .addTag('shipment-status',  '납품현황')
    .addTag('inventory',        '재고현황')
    .addTag('stock-movements',  '재고이동')
    .addTag('stock-usages',     '재고사용')
    .addTag('serial-numbers',   'S/N 관리')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'IMS API Docs',
  });
  // ────────────────────────────────────────────────────────────────────────

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}/api`);
  console.log(`📄 Swagger UI   → http://localhost:${port}/api/docs`);
}
bootstrap();
