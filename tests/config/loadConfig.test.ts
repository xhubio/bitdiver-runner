import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { loadConfig } from '../../src/config/loadConfig'

const VOLATILE = path.join(__dirname, '..', '..', 'tests', 'config', 'volatile')

const testSchema = z.object({
  server: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(3000)
  }),
  database: z.object({
    url: z.string(),
    password: z.string(),
    maxConnections: z.number().default(10)
  }),
  debug: z.boolean().default(false)
})

beforeEach(async () => {
  await fs.rm(VOLATILE, { recursive: true, force: true })
  await fs.mkdir(VOLATILE, { recursive: true })
})

afterAll(async () => {
  await fs.rm(VOLATILE, { recursive: true, force: true })
})

test('load from file with defaults', async () => {
  const configFile = path.join(VOLATILE, 'config.json')
  await fs.writeFile(
    configFile,
    JSON.stringify({
      server: { host: '0.0.0.0' },
      database: { url: 'postgres://db', password: 'secret' }
    })
  )

  const { config } = await loadConfig({
    schema: testSchema,
    file: configFile
  })

  expect(config.server.host).toBe('0.0.0.0')
  expect(config.server.port).toBe(3000) // default
  expect(config.database.url).toBe('postgres://db')
  expect(config.database.maxConnections).toBe(10) // default
  expect(config.debug).toBe(false) // default
})

test('inline values override file values', async () => {
  const configFile = path.join(VOLATILE, 'config.json')
  await fs.writeFile(
    configFile,
    JSON.stringify({
      server: { host: 'file-host' },
      database: { url: 'file-url', password: 'file-pw' }
    })
  )

  const { config } = await loadConfig({
    schema: testSchema,
    file: configFile,
    values: { server: { host: 'inline-host' } }
  })

  expect(config.server.host).toBe('inline-host')
  expect(config.database.url).toBe('file-url') // not overridden
})

test('env variables override everything', async () => {
  const configFile = path.join(VOLATILE, 'config.json')
  await fs.writeFile(
    configFile,
    JSON.stringify({
      server: { host: 'file-host', port: 8080 },
      database: { url: 'file-url', password: 'file-pw' }
    })
  )

  // Set env vars with prefix
  process.env.MYAPP_SERVER_HOST = 'env-host'
  process.env.MYAPP_SERVER_PORT = '9090'
  process.env.MYAPP_DEBUG = 'true'

  try {
    const { config } = await loadConfig({
      schema: testSchema,
      file: configFile,
      envPrefix: 'MYAPP'
    })

    expect(config.server.host).toBe('env-host')
    expect(config.server.port).toBe(9090) // coerced to number
    expect(config.debug).toBe(true) // coerced to boolean
    expect(config.database.url).toBe('file-url') // not overridden
  } finally {
    delete process.env.MYAPP_SERVER_HOST
    delete process.env.MYAPP_SERVER_PORT
    delete process.env.MYAPP_DEBUG
  }
})

test('different prefix for same schema', async () => {
  process.env.DEV_DATABASE_URL = 'postgres://dev'
  process.env.DEV_DATABASE_PASSWORD = 'dev-pw'
  process.env.PROD_DATABASE_URL = 'postgres://prod'
  process.env.PROD_DATABASE_PASSWORD = 'prod-pw'

  try {
    const dev = await loadConfig({
      schema: testSchema,
      envPrefix: 'DEV',
      values: { server: { host: 'dev', port: 3000 } }
    })

    const prod = await loadConfig({
      schema: testSchema,
      envPrefix: 'PROD',
      values: { server: { host: 'prod', port: 443 } }
    })

    expect(dev.config.database.url).toBe('postgres://dev')
    expect(prod.config.database.url).toBe('postgres://prod')
  } finally {
    delete process.env.DEV_DATABASE_URL
    delete process.env.DEV_DATABASE_PASSWORD
    delete process.env.PROD_DATABASE_URL
    delete process.env.PROD_DATABASE_PASSWORD
  }
})

test('validation error on missing required field', async () => {
  await expect(
    loadConfig({
      schema: testSchema,
      values: { server: { host: 'ok' } }
      // database.url and database.password are missing and have no default
    })
  ).rejects.toThrow('Config validation failed')
})

test('toString masks secrets', async () => {
  const result = await loadConfig({
    schema: testSchema,
    values: {
      server: { host: 'myhost' },
      database: { url: 'postgres://db', password: 'super-secret' }
    },
    secrets: ['database.password']
  })

  const output = result.toString()
  expect(output).toContain('myhost')
  expect(output).toContain('***')
  expect(output).not.toContain('super-secret')
})

test('load without file (values only)', async () => {
  const { config } = await loadConfig({
    schema: testSchema,
    values: {
      server: { host: 'direct' },
      database: { url: 'direct-url', password: 'pw' }
    }
  })

  expect(config.server.host).toBe('direct')
  expect(config.server.port).toBe(3000) // default
})

test('nested env variable override', async () => {
  process.env.TEST_DATABASE_MAX_CONNECTIONS = '50'

  try {
    const { config } = await loadConfig({
      schema: testSchema,
      envPrefix: 'TEST',
      values: {
        server: { host: 'h' },
        database: { url: 'u', password: 'p' }
      }
    })

    expect(config.database.maxConnections).toBe(50)
  } finally {
    delete process.env.TEST_DATABASE_MAX_CONNECTIONS
  }
})
