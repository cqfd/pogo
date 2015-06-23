'use strict';

import { assert } from 'chai'

describe('the simple version', () => {
  function pogo(star) {
    const gen = star()
    return new Promise(ok => {
      bounce()
      function bounce(input) {
        const output = gen.next(input)
        if (output.done) ok(output.value)
        else output.value.then(bounce)
      }
    })
  }

  it('handles promises that resolve', () => {
    return pogo(function*() {
      const num = yield Promise.resolve(123)
      const str = yield Promise.resolve("foo")
      return [num, str]
    }).then(v => assert.deepEqual(v, [123, "foo"]))
  })

  it("doesn't handle promises that reject though")
  it("doesn't handle pogos that throw exceptions either")
})

describe('the slightly more complicated version', () => {
  function pogo(star) {
    const gen = star()
    return new Promise(ok => {
      bounce()
      function bounce(input) {
        const output = gen.next(input)
        if (output.done) ok(output.value)
        else output.value.then(bounce, toss)
      }
      function toss(err) {
        const output = gen.throw(err)
        if (output.done) ok(output.value)
        else output.value.then(bounce, toss)
      }
    })
  }

  it('still handles promises that resolve', () => {
    return pogo(function*() {
      const num = yield Promise.resolve(123)
      const str = yield Promise.resolve("foo")
      return [num, str]
    }).then(v => assert.deepEqual(v, [123, "foo"]))
  })

  it('now handles promises that reject', () => {
    return pogo(function*() {
      try { yield Promise.reject('bang!') }
      catch (e) { assert.equal(e, 'bang!') }
    })
  })

  it("still doesn't handle pogos that throw exceptions though")
})

describe('the working version', () => {
  function pogo(star) {
    const gen = star()
    return new Promise(ok => {
      bounce()
      function bounce(input) { decode(gen.next(input)) }
      function toss(error) { decode(gen.throw(error)) }
      function decode(output) {
        if (output.done) ok(output.value)
        else output.value.then(bounce, toss)
      }
    })
  }

  it('still handles promises that resolve', () => {
    return pogo(function*() {
      const num = yield Promise.resolve(123)
      const str = yield Promise.resolve("foo")
      return [num, str]
    }).then(v => assert.deepEqual(v, [123, "foo"]))
  })

  it('still handles promises that reject', () => {
    return pogo(function*() {
      try { yield Promise.reject('bang!') }
      catch (e) { assert.equal(e, 'bang!') }
    })
  })

  it('now handles pogos that throw exceptions too', () => {
    return pogo(function*() {
      throw 'bang!'
    }).catch(e => assert.equal(e, 'bang!'))
  })
})

describe('the csp version', () => {
  class Channel {
    constructor() {
      this.putings = []
      this.takings = []
    }
    put(puter, value) {
      return new Promise(ok => {
        if (!this.takings.length) return this.putings.push({value, ok})
        const taking = this.takings.shift()
        taking.ok(value)
        ok()
      })
    }
    take(taker) {
      return new Promise(ok => {
        if (!this.putings.length) return this.takings.push({ok})
        const puting = this.putings.shift()
        puting.ok()
        ok(puting.value)
      })
    }
  }
  const chan = () => new Channel

  class Put {
    constructor(channel, value) {
      this.channel = channel;
      this.value = value;
    }
  }
  const put = (ch, val) => new Put(ch, val)

  class Race {
    constructor(ops) {
      this.ops = ops
    }
  }

  const isPromise = x => typeof x.then === 'function' && typeof x.throw === 'function'

  function pogo(star) {
    const gen = star()
    return new Promise(ok => {
      bounce()
      function bounce(input) { decode(gen.next(input)) }
      function toss(err) { decode(gen.throw(err)) }
      function decode(output) {
        if (output.done) return ok(output.value)
        const op = output.value
        if (isPromise(op)) op.then(bounce, toss)
        if (op instanceof Channel) op.take(gen).then(bounce)
        if (op instanceof Put) op.channel.put(gen, op.value).then(bounce)
        if (op instanceof Race) {
          const state = {finished: false}
          for (let op of op.ops) {
            if (isPromise(op)) {
              op.then(v => { if (!state.finished) { state.finished = true; bounce(v) } },
                      e => { if (!state.finished) { state.finished = true; toss(e) } })
            }
            if (op instanceof Channel) op.take(state).then(bounce)
            if (op instanceof Put) op.channel.put(state, op.value).then(bounce)
          }
        }
      }
    })
  }

  it('works', () => {
    const ch = new Channel
    pogo(function*() {
      for (let i = 0; i < 10; i++) yield put(ch, [i, 'tick'])
    })
    pogo(function*() {
      for (let i = 0; i < 10; i++) yield put(ch, [i, 'tock'])
    })
    return pogo(function*() {
      for (let i = 0; i < 10; i++) {
        assert.deepEqual(yield ch, [i, 'tick'])
        assert.deepEqual(yield ch, [i, 'tock'])
      }
    })
  })
})

describe('a generator example', () => {
  function* teammate(name) {
    console.log(`Hi there! I'm ${name} and I'm your teammate.`)
    console.log("I'll let you know if I have any blockers.")
    const num = yield "I'm blocked! I need a number."
    const str = yield "I'm blocked! I need a string."
    const num2 = yield "I'm blocked! I need another number."
    return `Ok, here's my work: ${[str, num * num2]}`
  }

  it('works', () => {
    const alice = teammate('Alice')
    assert.equal(alice.next().value, "I'm blocked! I need a number.");
    assert.equal(alice.next().value, "I'm blocked! I need a string.");
  })
})
