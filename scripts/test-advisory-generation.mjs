import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'
import axios from 'axios'
import ts from 'typescript'

// Exercise the production TypeScript without adding a browser test dependency.
async function loadTypeScript(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8')
  for (const [before, after] of replacements) source = source.replace(before, after)
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const { getAdvisoryGenerationValidationError, getAdvisoryGenerationError } = await loadTypeScript('../src/utils/advisoryGeneration.ts')
const validDraft = { heading: 'Flood advisory', source_text: 'Heavy flooding reported.', template_id: 7 }
assert.equal(getAdvisoryGenerationValidationError(validDraft), null)
for (const field of ['heading', 'source_text', 'template_id']) {
  assert.ok(getAdvisoryGenerationValidationError({ ...validDraft, [field]: '' }))
}
for (const template_id of [null, -1, 0, 1.5, 'invalid']) {
  assert.match(getAdvisoryGenerationValidationError({ ...validDraft, template_id }), /Select a template/)
}
assert.match(getAdvisoryGenerationError(new Error('canceled'), true), /timed out.*draft has been kept/i)
assert.match(getAdvisoryGenerationError({ isTimeout: true }), /Check the LLM connection/)
assert.equal(getAdvisoryGenerationError(new Error('Template is inactive')), 'Template is inactive')

const clientKey = Symbol.for('raven.advisory-generation.test-client')
const injectClient = ["import client from './client'", "const client = globalThis[Symbol.for('raven.advisory-generation.test-client')]"]
const requests = []
const heldWrites = []
let holdWrites = false
globalThis[clientKey] = axios.create({
  adapter: (config) => {
    requests.push(config)
    const response = { data: { id: 834, generated_text: 'Advisory body' }, status: 200, statusText: 'OK', headers: {}, config }
    if (holdWrites && (config.method === 'put' || config.url.endsWith('/save'))) {
      return new Promise((resolve, reject) => heldWrites.push({ resolve: () => resolve(response), reject }))
    }
    return Promise.resolve(response)
  },
})
const { notificationsApi, NOTIFICATION_REQUEST_TIMEOUT_MS, ADVISORY_GENERATION_TIMEOUT_MS } = await loadTypeScript('../src/api/notifications.ts', [injectClient])
assert.equal(NOTIFICATION_REQUEST_TIMEOUT_MS, 30_000)
assert.equal(ADVISORY_GENERATION_TIMEOUT_MS, 150_000)
const controller = new AbortController()
await notificationsApi.create(validDraft, { signal: controller.signal })
await notificationsApi.get(834)
await notificationsApi.update(834, { heading: 'Updated heading' })
await notificationsApi.generate(834, { template_id: 7 }, { signal: controller.signal })
assert.deepEqual(requests.map(({ timeout }) => timeout), [30_000, 30_000, 30_000, 150_000])
assert.equal(requests[0].signal, controller.signal)
assert.equal(requests[3].signal, controller.signal)
assert.equal(JSON.parse(requests[3].data).template_id, 7)

// A pending editor write must finish before generation proceeds, even if it fails.
holdWrites = true
const firstWrite = notificationsApi.update(834, { edited_text: 'Old edit' })
const secondWrite = notificationsApi.update(834, { edited_text: 'New edit' })
const headerSave = notificationsApi.save(834, 'Updated heading')
let writesSettled = false
const waitForWrites = notificationsApi.waitForPendingUpdates(834).then(() => { writesSettled = true })
heldWrites[0].resolve()
await firstWrite
assert.equal(writesSettled, false)
const failedWrite = assert.rejects(secondWrite, /Save failed/)
heldWrites[1].reject(new Error('Save failed'))
await failedWrite
assert.equal(writesSettled, false)
heldWrites[2].resolve()
await headerSave
await waitForWrites
assert.equal(writesSettled, true)
await notificationsApi.waitForPendingUpdates(834)

// Exercise real Axios timeout and abort behavior against a server that never responds.
const server = createServer((request) => request.resume())
server.listen(0, '127.0.0.1')
await once(server, 'listening')
try {
  const { port } = server.address()
  globalThis[clientKey] = axios.create({ baseURL: `http://127.0.0.1:${port}`, proxy: false })
  const shortDeadlineApi = await loadTypeScript('../src/api/notifications.ts', [
    injectClient,
    ['NOTIFICATION_REQUEST_TIMEOUT_MS = 30_000', 'NOTIFICATION_REQUEST_TIMEOUT_MS = 40'],
    ['ADVISORY_GENERATION_TIMEOUT_MS = 150_000', 'ADVISORY_GENERATION_TIMEOUT_MS = 70'],
  ])
  await assert.rejects(shortDeadlineApi.notificationsApi.generate(834, { template_id: 7 }), (error) => {
    assert.equal(error.code, 'ECONNABORTED')
    assert.match(getAdvisoryGenerationError(error), /timed out/)
    return true
  })
  const abort = new AbortController()
  const generation = shortDeadlineApi.notificationsApi.generate(834, { template_id: 7 }, { signal: abort.signal })
  abort.abort()
  await assert.rejects(generation, (error) => error.code === 'ERR_CANCELED')
} finally {
  server.closeAllConnections()
  server.close()
  await once(server, 'close')
  delete globalThis[clientKey]
}

console.log('Advisory generation checks passed: validation, request limits, pending saves, real timeout, and cancellation.')
