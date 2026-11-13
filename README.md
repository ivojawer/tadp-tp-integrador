# Plataforma de Logística y Rutas de Entrega - Backend

Backend de la plataforma logística para gestión de inventario, despacho de pedidos y seguimiento de rutas, desarrollado con NestJS, TypeScript, Kysely y PostgreSQL.

---

## Tabla de Contenidos

- [Plataforma de Logística y Rutas de Entrega - Backend](#plataforma-de-logística-y-rutas-de-entrega---backend)
  - [Tabla de Contenidos](#tabla-de-contenidos)
  - [Desarrollo Local (Local Development)](#desarrollo-local-local-development)
    - [Requisitos previos (Requirements)](#requisitos-previos-requirements)
    - [Configuración inicial (Setup)](#configuración-inicial-setup)
    - [Ejecución de Pruebas (Running Tests)](#ejecución-de-pruebas-running-tests)
    - [Ejecución de la Aplicación (Running App)](#ejecución-de-la-aplicación-running-app)
  - [Despliegue y Contenerización (Deployment)](#despliegue-y-contenerización-deployment)
    - [Requisitos del Sistema (System Requirements)](#requisitos-del-sistema-system-requirements)
    - [Levantar la Aplicación con Docker (Starting the App)](#levantar-la-aplicación-con-docker-starting-the-app)
    - [Comandos Útiles de Docker](#comandos-útiles-de-docker)
  - [Arquitectura y Estructura](#arquitectura-y-estructura)
  - [Documentación OpenAPI / Swagger](#documentación-openapi--swagger)

---

## Desarrollo Local (Local Development)

### Requisitos previos (Requirements)

Asegúrate de contar con las siguientes herramientas instaladas en tu entorno local:

- **Node.js**: Versión `>= 20.x` (Recomendado Node 22 LTS).
- **npm**: Versión `>= 10.x`.
- **Docker** y **Docker Compose**: Para la base de datos PostgreSQL local y pruebas de integración/E2E.
- **Git**

---

### Configuración inicial (Setup)

1. **Clonar el repositorio:**

   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd tadp-tp-integrador
   ```

2. **Instalar dependencias del proyecto:**

   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**

   Copia el archivo de ejemplo `.env.example` como `.env`:

   ```bash
   cp .env.example .env
   ```

   Variables clave configurables en `.env`:

   ```env
   NODE_ENV=development
   PORT=3000

   # Base de datos principal de desarrollo
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USER=postgres
   DATABASE_PASSWORD=postgres
   DATABASE_NAME=logistica_db

   # Base de datos dedicada para pruebas (E2E / Integración)
   DATABASE_NAME_TEST=logistica_test_db
   ```

4. **Levantar la base de datos PostgreSQL de desarrollo:**

   Para levantar únicamente el contenedor de PostgreSQL con las bases `logistica_db` y `logistica_test_db` inicializadas con su esquema y datos semilla (seeds):

   ```bash
   docker compose up -d postgres
   ```

---

### Ejecución de Pruebas (Running Tests)

El proyecto cuenta con suites de pruebas unitarias y pruebas end-to-end (E2E):

- **Pruebas Unitarias:**
  Se ejecutan con Jest aislando los repositorios y servicios con mocks:

  ```bash
  npm test
  ```

  Para ejecutarlas en modo observador (watch):

  ```bash
  npm run test:watch
  ```

  Para generar el reporte de cobertura de código (coverage):

  ```bash
  npm run test:cov
  ```

- **Pruebas End-to-End (E2E):**
  Prueban el ciclo HTTP completo (`supertest`) contra la base de datos PostgreSQL real de pruebas (`logistica_test_db`):

  ```bash
  npm run test:e2e
  ```

  > **Nota:** Para ejecutar los tests E2E, asegúrate de tener el servicio de PostgreSQL levantado (`docker compose up -d postgres`).

- **Verificación de Tipos y Estilo de Código:**

  ```bash
  npm run typecheck   # Chequeo estricto con TypeScript (tsc --noEmit)
  npm run lint        # Verificación y corrección automática con ESLint
  npm run format      # Formateo estricto con Prettier
  ```

---

### Ejecución de la Aplicación (Running App)

Una vez que la base de datos esté corriendo y las dependencias instaladas:

- **Modo Desarrollo (con hot-reload):**

  ```bash
  npm run start:dev
  ```

- **Modo Depuración (Debug):**

  ```bash
  npm run start:debug
  ```

- **Compilar y Ejecutar en Modo Producción Local:**

  ```bash
  npm run build
  npm run start:prod
  ```

La aplicación estará escuchando por defecto en `http://localhost:3000`.

---

## Despliegue y Contenerización (Deployment)

### Requisitos del Sistema (System Requirements)

Para desplegar la aplicación completa (backend + base de datos) en un servidor o entorno productivo, se requiere:

- **Sistema Operativo:** Linux (Ubuntu 20.04+, Debian 11+, RHEL/Rocky Linux 8+) o macOS.
- **Docker Engine:** Versión `>= 24.0.0`.
- **Docker Compose:** Versión `>= 2.20.0` (incluido en Docker Desktop / Docker CLI moderno).
- **Puertos disponibles en el host:** `3000` (API HTTP) y `5432` (PostgreSQL, opcional si sólo se expone internamente).

---

### Levantar la Aplicación con Docker (Starting the App)

El proyecto incluye un `Dockerfile` multi-stage optimizado para producción (utilizando usuario no root `appuser` sobre Alpine) y un `docker-compose.yml` preconfigurado.

1. **Configurar el entorno de producción:**

   Asegúrate de tener un archivo `.env` configurado con credenciales seguras de producción:

   ```env
   NODE_ENV=production
   PORT=3000
   DATABASE_HOST=postgres
   DATABASE_PORT=5432
   DATABASE_USER=postgres
   DATABASE_PASSWORD=tu_password_seguro
   DATABASE_NAME=logistica_db
   ```

2. **Construir y levantar todos los servicios:**

   ```bash
   docker compose up -d --build
   ```

   Este comando:
   - Levanta el contenedor de PostgreSQL (`logistica_postgres`).
   - Espera a que la base de datos pase el healthcheck (`pg_isready`).
   - Ejecuta los scripts de inicialización (`01-init.sql` y `02-init-test-db.sh`).
   - Compila la imagen Docker del backend en multi-stage y levanta el servicio `app` (`logistica_backend`).

3. **Verificar el estado de los contenedores:**

   ```bash
   docker compose ps
   ```

---

### Comandos Útiles de Docker

- **Ver logs en tiempo real:**

  ```bash
  docker compose logs -f app          # Logs exclusivos del backend
  docker compose logs -f postgres     # Logs de la base de datos
  docker compose logs -f              # Logs combinados
  ```

- **Detener los servicios:**

  ```bash
  docker compose down
  ```

- **Detener y reiniciar desde cero (eliminando volúmenes de datos):**

  ```bash
  docker compose down -v
  docker compose up -d --build
  ```

- **Acceder a la terminal del contenedor:**

  ```bash
  docker compose exec app sh          # Shell dentro del backend
  docker compose exec postgres psql -U postgres -d logistica_db  # CLI interactivo de PostgreSQL
  ```

---

## Arquitectura y Estructura

El proyecto implementa una arquitectura en 3 capas por módulo (`src/modules/<modulo>`):

```
HTTP Request ──► [ Controllers ] ──► [ Services ] ──► [ Repositories ] ──► PostgreSQL (Kysely)
```

- **Controllers (`*.controller.ts`)**: Adaptadores HTTP/REST, validación de request vía DTOs (`class-validator`), manejo de códigos de respuesta HTTP y documentación Swagger.
- **Services (`*.service.ts`)**: Lógica pura del negocio y orquestación de reglas de dominio (ciclos de vida de órdenes, validaciones de stock, asignaciones).
- **Repositories (`*.repository.ts`)**: Abstracción de acceso a datos utilizando **Kysely** fuertemente tipado sobre PostgreSQL.

---

## Documentación OpenAPI / Swagger

Con la aplicación en ejecución, la documentación interactiva de Swagger UI está disponible en:

```
http://localhost:3000/api/docs
```

Permite inspeccionar esquemas, modelos DTO y probar los endpoints REST directamente desde el navegador.
