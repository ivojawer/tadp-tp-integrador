import { Provider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { Database } from './types'

export const KYSELY_DB = 'KYSELY_DB'

export const databaseProviders: Provider[] = [
  {
    provide: KYSELY_DB,
    inject: [ConfigService],
    useFactory: (configService: ConfigService): Kysely<Database> => {
      const isTest = configService.get<string>('NODE_ENV') === 'test'
      const dbName = isTest
        ? configService.get<string>('DATABASE_NAME_TEST', 'logistica_test_db')
        : configService.get<string>('DATABASE_NAME', 'logistica_db')

      const dialect = new PostgresDialect({
        pool: new Pool({
          host: configService.get<string>('DATABASE_HOST', 'localhost'),
          port: configService.get<number>('DATABASE_PORT', 5432),
          user: configService.get<string>('DATABASE_USER', 'postgres'),
          password: configService.get<string>('DATABASE_PASSWORD', 'postgres'),
          database: dbName,
        }),
      })

      return new Kysely<Database>({
        dialect,
      })
    },
  },
]
