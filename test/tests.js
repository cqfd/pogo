'use strict'

import { assert } from 'chai'
import pogo, { chan, put, race, ringBuffer, strictBuffer } from '../src/index.js'

const wtf = x => console.log('wtf', x)
const sleep = ms => new Promise(awaken => setTimeout(awaken, ms))

describe('returning a value', () => {
  it("resolves the pogo's promise", () => {
    return pogo(function*() {
      return 123
    }).then(v => assert.equal(v, 123)) })
})

describe('raising an exception', () => {
  it("rejects the pogo's promise", () => {
    return pogo(function*() {
      throw 'bang!'
    }).catch(e => assert.equal(e, 'bang!'))
  })
  it("rejects the pogo's promise even after a yield", () => {
    return pogo(function*() {
      const msg = yield Promise.resolve('bang')
      let exclamation
      try { yield Promise.reject('!') }
      catch (e) { exclamation = e }
      throw msg + exclamation
    }).catch(e => assert.equal(e, 'bang!'))
  })
})

describe('yielding a promise', () => {
  describe('that resolves', () => {
    it('resumes the pogo with the resolution', () => {
      return pogo(function*() {
        assert.equal(yield Promise.resolve(123), 123)
      })
    })
  })

  describe('that rejects', () => {
    it('throws the rejection back into the pogo', () => {
      return pogo(function*() {
        try { yield Promise.reject('bang!') }
        catch (e) { assert.equal(e, 'bang!') }
      })
    })
  })
})

describe('yielding a put or a take', () => {
  it('resumes the pogo with a corresponding take or put', () => {
    const ch = chan()
    pogo(function*() {
      for (let i = 0; i < 10; i++) {
        yield put(ch, i)
      }
    })
    return pogo(function*() {
      for (let i = 0; i < 10; i++) {
        assert.equal(i, yield ch)
      }
    })
  })
})

describe('race', () => {
  it('works with promises', () => {
    return pogo(function*() {
      const ret = yield race([sleep(1000), Promise.resolve('woot')])
      assert.equal(ret, 'woot')
    })
  })

  it('cancels slow alternatives', () => {
    const log = []
    const ch1 = chan()
    const ch2 = chan()

    pogo(function*() {
      yield race([put(ch1, 'first'), put(ch2, 'second')])
      log.push('put first')
      yield put(ch2, 'deuxieme')
      log.push('put deuxieme')
    }).catch(wtf)

    return pogo(function*() {
      const r1 = yield race([ch1, ch2])
      log.push('alted')
      assert.equal(r1.channel, ch1)
      assert.equal(r1.value, 'first')

      const r2 = yield race([ch1, ch2])
      log.push('alted')
      assert.equal(r2.channel, ch2)
      assert.equal(r2.value, 'deuxieme')

      assert.deepEqual(log, ['put first', 'alted', 'put deuxieme', 'alted'])
    })
  })
})

describe('yielding a generator function', () => {
  it('works', () => {
    function* example(ch) {
      const x = yield Promise.resolve(123)

      let y
      try { yield Promise.reject('bang!') }
      catch (e) { y = 456 }

      const z = yield ch

      return [x, y, z]
    }

    return pogo(function*() {
      const ch = chan()
      pogo(function*() {
        yield put(ch, 'sup')
      })

      assert.deepEqual(yield example(ch), [123, 456, 'sup'])
    })
  })

  it('is safe even if you yield the same generator multiple times', () => {
    function* star(x) {
      const y = yield Promise.resolve('foo')
      const z = yield Promise.resolve('bar')
      return [x, y, z]
    }
    return pogo(function*() {
      const gen = star(123)
      assert.equal(123, yield race([gen, Promise.resolve(123)]))
      assert.equal(456, yield race([gen, Promise.resolve(456)]))
      assert.deepEqual(yield race([gen, Promise.resolve(789)]), [123, 'foo', 'bar'])
    })
  })
})

describe('async/callback-based interface', () => {
  describe('putAsync', () => {
    it('works', (done) => {
      const ch = chan()
      pogo(function*() {
        assert.equal(yield ch, 123)
      })
      ch.putAsync(123, done)
    })
  })

  describe('takeAsync', () => {
    it('works', (done) => {
      const ch = chan()
      pogo(function*() {
        yield put(ch, 123)
      })
      ch.takeAsync(v => {
        assert.equal(v, 123)
        return done()
      })
    })
  })
})

describe('sharing a channel between multiple pogos', () => {
  it('works', () => {
    const log = []
    const ch = chan()
    pogo(function*() {
      yield put(ch, 'foo')
      log.push('put foo')
    }).catch(wtf)
    pogo(function*() {
      yield put(ch, 'bar')
      log.push('put bar')
    }).catch(wtf)
    pogo(function*() {
      yield put(ch, 'baz')
      log.push('put baz')
    }).catch(wtf)
    return pogo(function*() {
      assert.equal(yield ch, 'foo')
      log.push('took foo')
      assert.equal(yield ch, 'bar')
      log.push('took bar')
      assert.equal(yield ch, 'baz')
      log.push('took baz')
      assert.deepEqual(log, [
        'put foo', 'took foo', 'put bar', 'took bar', 'put baz', 'took baz'
      ])
    })
  })
})

describe('puting and taking from the same channel', () => {
  it('works', () => {
    const log = []
    const ch = chan()

    pogo(function*() {
      const ping = yield ch
      log.push('received ' + ping)
      yield put(ch, 'pong')
      log.push('sent pong')
    }).catch(wtf)

    return pogo(function*() {
      yield put(ch, 'ping')
      log.push('sent ping')
      const pong = yield ch
      log.push('received ' + pong)

      assert.deepEqual(log, ['received ping', 'sent ping', 'sent pong', 'received pong'])
    })
  })
})

describe('pogos within pogos', () => {
  it('works', (done) => {
    return pogo(function*() {
      const ch = chan()
      pogo(function*() {
        for (let i = 0; i < 10; i++) {
          yield put(ch, i)
        }
      }).catch(done)
      pogo(function*() {
        for (let i = 0; i < 10; i++) {
          assert.equal(yield ch, i)
        }
        done()
      }).catch(done)
    })
  })
})

describe('fairness', () => {
  it('works for a take and then a put', () => {
    const log = []
    const ch = chan()
    pogo(function*() {
      yield ch
      log.push('took')
    })
    return pogo(function*() {
      yield put(ch)
      log.push('put')
    }).then(() => assert.deepEqual(log, ['took', 'put']))
  })

  it('works for a put and then a take', () => {
    const log = []
    const ch = chan()
    pogo(function*() {
      yield put(ch)
      log.push('put')
    })
    return pogo(function*() {
      yield ch
      log.push('took')
    }).then(() => assert.deepEqual(log, ['put', 'took']))
  })
})

describe('a strict buffer with non-zero capacity', () => {
  it('lets you successfully put n times without any takers', () => {
    const ch = chan(strictBuffer(2))
    return pogo(function*() {
      yield put(ch, 1)
      yield put(ch, 2)
      assert.ok('we made it!')
    })
  })

  it('makes puters wait after the nth put though', () => {
    const ch = chan(strictBuffer(2))
    return pogo(function*() {
      yield put(ch, 1)
      yield put(ch, 2)
      const r = yield race([sleep(10), put(ch, 3)])
      assert.equal(r, undefined)
    })
  })
})

describe('using a ring buffer', () => {
  it('works', () => {
    const ch = chan(ringBuffer(1))
    return pogo(function*() {
      yield put(ch, 1)
      yield put(ch, 2)
      yield put(ch, 3)
      assert.equal(yield ch, 3)
    })
  })
})
