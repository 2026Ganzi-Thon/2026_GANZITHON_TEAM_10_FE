const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
const vm = require('node:vm')

const source = readFileSync(join(__dirname, '../src/features/personal-program/shapeApi.ts'), 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText

const loadTopic = async (records, drawing) => {
  const calls = []
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    require: () => ({
      moyangRequest: () => ({
        json: async (url) => {
          calls.push(url)
          return url === '/api/records' ? records : drawing
        },
      }),
    }),
  })
  return { topic: await exports.loadOnlyRecordTopic(new AbortController().signal), calls }
}

test('회차에 연결된 유일한 기록의 그림 주제만 표시한다', async () => {
  const record = { recordId: 7, imageUrl: '/api/drawings/4/image' }
  const drawing = { recordId: 7, topic: { title: '내가 서 있는 자리' } }
  const single = { items: [record], hasNext: false }
  assert.equal((await loadTopic(single, drawing)).topic, '내가 서 있는 자리')
  assert.equal((await loadTopic(single, { ...drawing, recordId: 8 })).topic, null)
  const multiple = await loadTopic({ items: [record, record], hasNext: false }, drawing)
  assert.equal(multiple.topic, null)
  assert.deepEqual(multiple.calls, ['/api/records'])
  assert.equal((await loadTopic({ items: [record], hasNext: true }, drawing)).topic, null)
})
