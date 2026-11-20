const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const path = join(__dirname, '../src/features/personal-program/completedActivityTopics.ts')
const source = readFileSync(path, 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText

test('동시 회고 저장으로 진행도가 바뀌면 최신 기록을 이전 회차에 표시하지 않는다', async () => {
  const firstShape = {
    themeCode: 'STUDY_CAREER',
    completedRounds: 1,
    totalRounds: 2,
    weekdays: ['MON'],
  }
  const updatedShape = { ...firstShape, completedRounds: 2 }
  const records = [
    { recordId: 8, imageUrl: '/api/drawings/5/image' },
    { recordId: 7, imageUrl: '/api/drawings/4/image' },
  ]
  const calls = []
  const exported = {}
  vm.runInNewContext(code, {
    exports: exported,
    require: () => ({
      moyangRequest: () => ({
        json: async (url, config) => {
          calls.push(url)
          if (url === '/api/records') {
            const { size } = config.params
            return { items: records.slice(0, size), hasNext: records.length > size }
          }
          if (url === '/api/shapes/me') return updatedShape
          if (url === '/api/drawings/4') {
            return { recordId: 7, topic: { title: '첫 번째 그림 주제' } }
          }
          assert.equal(url, '/api/drawings/5')
          return { recordId: 8, topic: { title: '두 번째 그림 주제' } }
        },
      }),
    }),
  })
  const { loadScheduledActivityTopics } = exported
  const { signal } = new AbortController()
  const stale = await loadScheduledActivityTopics(firstShape, signal)
  assert.equal(stale.updatedShape, updatedShape)
  assert.equal(stale.titles, undefined)
  assert.deepEqual(calls, ['/api/records', '/api/shapes/me'])

  const refreshed = await loadScheduledActivityTopics(stale.updatedShape, signal)
  assert.deepEqual(Array.from(refreshed.titles), ['첫 번째 그림 주제', '두 번째 그림 주제'])
})
