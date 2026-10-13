export const countingRowsRead = (sql: SqlStorage) => {
  const cursors: Array<{ readonly rowsRead: number }> = []
  const counted: SqlStorage = {
    exec: <T extends Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]) => {
      const cursor = sql.exec<T>(query, ...bindings)
      cursors.push(cursor)
      return cursor
    },
    get databaseSize() {
      return sql.databaseSize
    },
    Cursor: sql.Cursor,
    Statement: sql.Statement,
  }
  return { sql: counted, rowsRead: () => cursors.reduce((sum, cursor) => sum + cursor.rowsRead, 0) }
}
