import '~/lib/load-env'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

export const db = drizzle({
  connection: { url: process.env.DATABASE_URL ?? 'file:./data/sqlite.db' },
  schema,
})

type TransactionCallback = Parameters<typeof db.transaction>[0]
type DbTransaction = Parameters<TransactionCallback>[0]

export type DbExecutor = typeof db | DbTransaction
