// Shared CSV helpers for streaming export routes.
//
// `csvCell` escapes a single value per RFC 4180. `streamCsv` wraps the
// boilerplate of paged streaming export: TextEncoder, ReadableStream,
// header enqueue, error-to-controller. Pass a `fetchPage(cursor)` that
// returns rows + a next-cursor sentinel.

const ENC = new TextEncoder()

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export interface CsvStreamOptions<TCursor> {
  header: string
  initialCursor: TCursor
  fetchPage: (cursor: TCursor) => Promise<{ rows: string[]; nextCursor: TCursor; done: boolean }>
}

export function streamCsv<TCursor>(opts: CsvStreamOptions<TCursor>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(ENC.encode(opts.header))
      let cursor = opts.initialCursor
      try {
        while (true) {
          const { rows, nextCursor, done } = await opts.fetchPage(cursor)
          if (rows.length > 0) controller.enqueue(ENC.encode(rows.join('\n') + '\n'))
          if (done) break
          cursor = nextCursor
        }
      } catch (err) {
        controller.error(err)
        return
      }
      controller.close()
    },
  })
}

export function csvResponse(stream: ReadableStream<Uint8Array>, filename: string): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
