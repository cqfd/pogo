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

  constructor() {
    this.takings = []
    this.putings = []
  }

  put(doer, val) {
    this._disqualifySlowRacers()
    return new Promise((ok, notOk) => {
      if (doer.finished) return notOk()
      if (!this.takings.length) return this.putings.push({val, doer, ok, notOk})
      const taking = this.takings.shift()
      this._resume(taking, val)
      if (doer.finished !== undefined) doer.finished = true
      ok()
    })
  }

  putAsync(val, cb) {
    this._disqualifySlowRacers()
    const ok = cb || (() => {})
    if (!this.takings.length) return this.putings.push({val, doer: 'async', ok})
    const taking = this.takings.shift()
    this._resume(taking, val)
    ok()
  }

  take(doer) {
    this._disqualifySlowRacers()
    return new Promise((ok, notOk) => {
      if (doer.finished) return notOk()
      if (!this.putings.length) return this.takings.push({doer, ok, notOk})
      const puting = this.putings.shift()
      this._resume(puting)
      if (doer.finished !== undefined) doer.finished = true
      ok(puting.val)
    })
  }

  takeAsync(cb) {
    this._disqualifySlowRacers()
    const ok = cb || (() => {})
    if (!this.putings.length) return this.takings.push({doer: 'async', ok})
    const puting = this.putings.shift()
    this._resume(puting)
    ok(puting.val)
  }

  _disqualifySlowRacers() {
    for (let t of this.takings) {
      if (t.doer.finished) t.notOk()
    }
    this.takings = this.takings.filter(t => !t.doer.finished)
    for (let p of this.putings) {
      if (p.doer.finished) p.notOk()
    }
    this.putings = this.putings.filter(p => !p.doer.finished)
  }
  _resume(doing, val) {
    if (doing.doer.finished !== undefined) doing.doer.finished = true
    doing.ok(val)
  }
}
pogo.chan = () => new Channel()

const isPromise = x => typeof x.then === 'function'
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function'
