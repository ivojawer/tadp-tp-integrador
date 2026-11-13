import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { Client } from 'pg'

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../.env.development') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const DB_HOST = process.env.DATABASE_HOST || 'localhost'
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5432', 10)
const DB_USER = process.env.DATABASE_USER || 'postgres'
const DB_PASSWORD = process.env.DATABASE_PASSWORD || 'postgres'
const DB_NAME = process.env.DATABASE_NAME || 'logistica_db'
const DB_NAME_TEST = process.env.DATABASE_NAME_TEST || 'logistica_test_db'

function ensureDockerPath(): void {
  const dockerAppBin = '/Applications/Docker.app/Contents/Resources/bin'
  const currentPath = process.env.PATH || ''
  if (!currentPath.includes(dockerAppBin) && fs.existsSync(dockerAppBin)) {
    process.env.PATH = `${dockerAppBin}:/usr/local/bin:${currentPath}`
  }
}

function startDockerPostgres(): void {
  console.log('📦 Verificando y levantando contenedor Docker de PostgreSQL...')
  ensureDockerPath()

  try {
    execSync('docker compose up -d postgres', {
      stdio: 'inherit',
      env: process.env,
    })
    console.log('✅ Contenedor PostgreSQL iniciado correctamente.')
  } catch (error) {
    console.error(
      '❌ Error al ejecutar docker compose. Asegúrate de tener Docker corriendo en tu sistema.',
    )
    throw error
  }
}

async function waitForPostgres(maxAttempts = 30, delayMs = 1000): Promise<void> {
  console.log('⏳ Esperando a que PostgreSQL acepte conexiones...')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = new Client({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: 'postgres',
    })

    try {
      await client.connect()
      await client.query('SELECT 1')
      await client.end()
      console.log('✅ PostgreSQL está listo para recibir consultas.')
      return
    } catch {
      await client.end().catch(() => {})
      if (attempt === maxAttempts) {
        throw new Error(
          `No se pudo conectar a PostgreSQL en ${DB_HOST}:${DB_PORT} luego de ${maxAttempts} intentos.`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

async function ensureDatabaseExists(dbName: string): Promise<void> {
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'postgres',
  })

  await client.connect()
  try {
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
    if (res.rowCount === 0) {
      console.log(`🔨 Creando base de datos "${dbName}"...`)
      await client.query(`CREATE DATABASE "${dbName}"`)
      console.log(`✅ Base de datos "${dbName}" creada.`)
    } else {
      console.log(`ℹ️ La base de datos "${dbName}" ya existe.`)
    }
  } finally {
    await client.end()
  }
}

async function applySqlFile(dbName: string, filePath: string): Promise<void> {
  console.log(`📄 Aplicando esquema en "${dbName}" desde ${path.basename(filePath)}...`)
  const sql = fs.readFileSync(filePath, 'utf-8')

  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: dbName,
  })

  await client.connect()
  try {
    await client.query(sql)
    console.log(`✅ Esquema y datos aplicados exitosamente en "${dbName}".`)
  } finally {
    await client.end()
  }
}

async function setup(): Promise<void> {
  console.log('🚀 Iniciando configuración de base de datos para entorno local...')
  const initSqlPath = path.resolve(__dirname, '../docker/init.sql')

  if (!fs.existsSync(initSqlPath)) {
    throw new Error(`Archivo de inicialización no encontrado en: ${initSqlPath}`)
  }

  // 1. Iniciar Docker
  startDockerPostgres()

  // 2. Esperar conexión
  await waitForPostgres()

  // 3. Crear bases de datos principal y de tests
  await ensureDatabaseExists(DB_NAME)
  await ensureDatabaseExists(DB_NAME_TEST)

  // 4. Aplicar DDL y datos en ambas bases
  await applySqlFile(DB_NAME, initSqlPath)
  await applySqlFile(DB_NAME_TEST, initSqlPath)

  console.log('\n🎉 Base de datos configurada y lista para operar.')
}

setup().catch((error) => {
  console.error('❌ Error durante db:setup:', error)
  process.exit(1)
})
