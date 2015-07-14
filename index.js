'use strict'

/*
 * pogo : *r -> promise r
 * pogo : ((...args -> *r), ...args) -> promise r
 */
export default function pogo(genOrStar, ...args) {
  const gen = isGen(genOrStar) ? genOrStar : genOrStar(...args)
  const cachedPromisifications = new WeakMap
  return new Promise((ok, notOk) => {
    bounce()

    function bounce(input) {
      let output
      try { output = gen.next(input) }
      catch (e) { notOk(e); return }
      decode(output)
    }
    function toss(error) {
      let output
      try { output = gen.throw(error) }
      catch (e) { notOk(e); return }
      decode(output)
    }

    function decode(output) {
      if (output.done) return ok(output.value)

      const instr = output.value
      if (isPromise(instr)) return instr.then(bounce, toss)
      if (instr instanceof Channel) return instr.take(gen).then(bounce)
      if (instr instanceof Put) return instr.ch.put(gen, instr.val).then(bounce)
      if (instr instanceof Race) {
        const race = { finished: false }
        return instr.ops.forEach(op => {
          if (isPromise(op)) {
            op.then(i => { if (!race.finished) { race.finished = true; bounce(i) } },
                    e => { if (!race.finished) { race.finished = true; toss(e) } })
          }
          if (op instanceof Channel) {
            op.take(race).then(i => bounce({ value: i, channel: op }))
          }
          if (op instanceof Put) {
            op.ch.put(race, op.val).then(() => bounce({ channel: op }))
          }
          if (isGen(op)) {
            if (!cachedPromisifications.has(op)) cachedPromisifications.set(op, pogo(op))
            cachedPromisifications.get(op).then(i => {
              if (!race.finished) { race.finished = true; bounce(i) }
            }, e => {
              if (!race.finished) { race.finished = true; toss(e) }
            })
          }
        })
      }
      if (isGen(instr)) {
        if (!cachedPromisifications.has(instr)) cachedPromisifications.set(instr, pogo(instr))
        return cachedPromisifications.get(instr).then(bounce, toss)
      }

      notOk(new Error("Invalid yield instruction: " + instr + "."))
    }
  })
}

class Put {
  constructor(ch, val) {
    this.ch = ch
    this.val = val
  }
}
pogo.put = (ch, val) => new Put(ch, val)

class Race {
  constructor(ops) {
    this.ops = ops
  }
}
pogo.race = ops => new Race(ops)

class Channel {
  constructor(buf) {
    this.takings = []
    this.putings = buf || new Buffer(0)
  }

  _take(taker, ok, notOk) {
    if (taker.finished) return notOk()

    this._disqualifySlowRacers()
    if (!this.putings.empty()) {
      const puting = this.putings.shift()
      if (puting.alreadyResumed) return ok(puting.value)
      if (puting.puter.finished !== undefined) puting.puter.finished = true
      puting.ok()

      if (taker.finished !== undefined) taker.finished = true
      ok(puting.value)
    } else {
      this.takings.push({taker, ok, notOk})
    }
  }

  _put(puter, value, ok, notOk) {
    if (puter.finished) return notOk()

    this._disqualifySlowRacers()
    if (this.takings.length) {
      const taking = this.takings.shift()
      if (taking.taker.finished !== undefined) taking.taker.finished = true
      taking.ok(value)
      if (puter.finished !== undefined) puter.finished = true
      ok()
    } else if (this.putings.underCapacity()) {
      this.putings.push({value, alreadyResumed: true})
      ok()
    } else {
      this.putings.push({puter, ok, notOk, value})
    }
  }

  put(puter, value) { return new Promise(this._put.bind(this, puter, value)) }
  putAsync(value, ok = noOp) { this._put('async', value, ok) }

  take(taker) { return new Promise(this._take.bind(this, taker)) }
  takeAsync(ok = noOp) { return this._take('async', ok) }

  _disqualifySlowRacers() {
    for (let t of this.takings) {
      if (t.taker.finished) t.notOk()
    }
    this.takings = this.takings.filter(t => !t.taker.finished)
    for (let p of this.putings) {
      if (!p.alreadyResumed && p.puter.finished) p.notOk()
    }
    this.putings.filter(p => p.alreadyResumed || !p.puter.finished)
  }
}
pogo.chan = buf => new Channel(buf)

class Buffer {
  constructor(capacity) {
    this.capacity = capacity
    this.buf = []
  }
  empty() { return this.buf.length === 0 }
  underCapacity() { return this.buf.length < this.capacity }
  push(x) { this.buf.push(x) }
  shift() { return this.buf.shift() }
  filter(p) { this.buf = this.buf.filter(p) }
  [Symbol.iterator]() { return this.buf[Symbol.iterator]() }
}
pogo.strictBuffer = capacity => new Buffer(capacity)

class SlidingBuffer extends Buffer {
  underCapacity() { return true }
  push(x) {
    if (this.buf.length >= this.capacity) this.buf.shift()
    this.buf.push(x)
  }
}
pogo.slidingBuffer = capacity => new SlidingBuffer(capacity)

const isPromise = x => typeof x.then === 'function'
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function'
const noOp = () => {}
