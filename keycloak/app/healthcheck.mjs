const origin = process.env.APP_ORIGIN

if (!origin) {
  throw new Error('APP_ORIGIN is required')
}

const response = await fetch(new URL('/healthz', origin), {
  signal: AbortSignal.timeout(3_000),
})

if (!response.ok || (await response.text()) !== 'ok') {
  throw new Error(`app health check failed with HTTP ${response.status}`)
}
