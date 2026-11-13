import { Global, Module } from '@nestjs/common'
import { KYSELY_DB, databaseProviders } from './database.provider'

@Global()
@Module({
  providers: [...databaseProviders],
  exports: [KYSELY_DB],
})
export class DatabaseModule {}
