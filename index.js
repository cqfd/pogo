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
    return this._tradePromise(puter, this.takings, this.putings, val)
  }
  putAsync(val, cb) {
    this._disqualifySlowRacers()
    this._tradeAsync(this.takings, this.putings, cb, val)
  }
  take(taker) {
    this._disqualifySlowRacers()
    return this._tradePromise(taker, this.putings, this.takings)
  }
  takeAsync(cb) {
    this._disqualifySlowRacers()
    this._tradeAsync(this.putings, this.takings, cb)
  }

  _tradePromise(us, them, queue, val) {
    return new Promise((ok, notOk) => {
      if (us.finished) return notOk()
      if (!them.length) return queue.push({doer: us, ok, notOk, val})
      this._exchange(us, them, ok, val)
    })
  }
  _tradeAsync(them, queue, ok = (() => {}), val) {
    if (!them.length) return queue.push({doer: 'async', ok, val})
    this._exchange('async', them, ok, val)
  }
  _exchange(us, them, ok, val) {
    const partner = them.shift()
    if (partner.doer.finished !== undefined) partner.doer.finished = true
    partner.ok(val)
    if (us.finished !== undefined) us.finished = true
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
}
pogo.chan = () => new Channel()

const isPromise = x => typeof x.then === 'function'
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function'
