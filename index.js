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

  put(puter, val) {
    this._disqualifySlowRacers()
    return this._promise(puter, this.putings, this.takings, val)
  }
  putAsync(val, cb) {
    this._disqualifySlowRacers()
    this._async(this.putings, this.takings, cb, val)
  }
  take(taker) {
    this._disqualifySlowRacers()
    return this._promise(taker, this.takings, this.putings)
  }
  takeAsync(cb) {
    this._disqualifySlowRacers()
    this._async(this.takings, this.putings, cb)
  }

  _promise(doer, doers, partners, val) {
    return new Promise((ok, notOk) => {
      if (doer.finished) return notOk()
      if (!partners.length) return doers.push({doer, ok, notOk, val})
      this._handoff(doer, ok, partners, val)
    })
  }
  _async(doers, partners, cb, val) {
    const ok = cb || (() => {})
    if (!partners.length) return this.doers.push({doer: 'async', ok, val})
    this._handoff('async', ok, partners, val)
  }
  _handoff(doer, ok, partners, val) {
    const partner = partners.shift()
    this._resume(partner, val)
    if (doer.finished !== undefined) doer.finished = true
    ok(partner.val)
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
