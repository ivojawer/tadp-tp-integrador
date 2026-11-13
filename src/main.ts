import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  // Logger estructurado Pino
  app.useLogger(app.get(Logger))

  // Pipes de validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  )

  // Filtro global de excepciones
  app.useGlobalFilters(new AllExceptionsFilter())

  // Configuración de OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Plataforma de Logística y Rutas de Entrega')
    .setDescription(
      'API REST del backend logístico para gestión de inventario, pedidos, tracking y despacho',
    )
    .setVersion('1.0.0')
    .addTag('Ordenes', 'Gestión del ciclo de vida de órdenes y pedidos')
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, document)

  const port = process.env.PORT || 3000
  await app.listen(port)

  const logger = app.get(Logger)
  logger.log(`Aplicación iniciada y escuchando en el puerto ${port}`)
  logger.log(`Documentación Swagger disponible en http://localhost:${port}/api/docs`)
}

bootstrap()
