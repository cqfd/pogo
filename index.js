'use strict';

export default function pogo(star, args) {
  const gen = isGen(star) ? star : star.apply(null, args)
  const cachedPromisifications = new WeakMap
  return new Promise((ok, notOk) => {
    bounce()

    function bounce(input) { decode(gen.next(input)) }
    function toss(error) { decode(gen.throw(error)) }

    function decode(output) {
      if (output.done) return ok(output.value)

      const instr = output.value
      if (isPromise(instr)) return instr.then(bounce, toss)
      if (instr instanceof Unbuffered) return instr.take(gen).then(bounce)
      if (instr instanceof Put) return instr.ch.put(gen, instr.val).then(bounce)
      if (instr instanceof Race) {
        const race = { finished: false }
        return instr.ops.forEach(op => {
          if (isPromise(op)) {
            op.then(i => { if (!race.finished) { race.finished = true; bounce(i) } },
                    e => { if (!race.finished) { race.finished = true; toss(e) } })
          }
          if (op instanceof Unbuffered) {
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

class Unbuffered {

  constructor() {
    this.takings = []
    this.putings = []
  }

  put(puter, val) {
    return new Promise((ok, notOk) => {
      if (puter.finished) return notOk()

      this.takings = this.takings.filter(t => !t.taker.finished)
      if (!this.takings.length) return this.putings.push({val, puter, ok, notOk})

      const taking = this.takings.shift()
      if (taking.taker.finished !== undefined) taking.taker.finished = true
      taking.ok(val)

      if (puter.finished !== undefined) puter.finished = true
      ok()
    })
  }

  putAsync(val, cb) {
    const ok = cb || (() => {})
    this.takings = this.takings.filter(t => !t.taker.finished)

    if (!this.takings.length) return this.putings.push({val, puter: 'async', ok})

    const taking = this.takings.shift()
    if (taking.taker.finished !== undefined) taking.taker.finished = true
    taking.ok(val)

    ok()
  }

  take(taker) {
    return new Promise((ok, notOk) => {
      this.putings = this.putings.filter(p => !p.puter.finished)
      if (taker.finished) return notOk()

      if (!this.putings.length) return this.takings.push({taker, ok, notOk})

      const puting = this.putings.shift()
      if (puting.puter.finished !== undefined) puting.puter.finished = true
      puting.ok()

      if (taker.finished !== undefined) taker.finished = true
      ok(puting.val)
    })
  }

  takeAsync(cb) {
    const ok = cb || (() => {})
    this.putings = this.putings.filter(p => !p.puter.finished)

    if (!this.putings.length) return this.takings.push({taker: 'async', ok})

    const puting = this.putings.shift()
    if (puting.puter.finished !== undefined) puting.puter.finished = true
    puting.ok()

    ok(puting.val)
  }
}
pogo.chan = () => new Unbuffered()

const isPromise = x => typeof x.then === 'function'
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function'
