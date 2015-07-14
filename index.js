'use strict'

import { Channel } from './channels'
import { Put, Race } from './ops'

/*
 * pogo : *r -> promise r
 * pogo : ((...args -> *r), ...args) -> promise r
 */
export default function pogo(genOrStar, ...args) {
  const gen = isGen(genOrStar) ? genOrStar : genOrStar(...args)
  const cachedPromisifications = new WeakMap()
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
      if (output.done) { ok(output.value); return }

      const instr = output.value
      if (isPromise(instr)) { instr.then(bounce, toss); return }
      if (instr instanceof Channel) { instr.take(gen).then(bounce); return }
      if (instr instanceof Put) { instr.ch.put(gen, instr.val).then(bounce); return }
      if (instr instanceof Race) {
        const race = { finished: false }
        instr.ops.forEach(op => {
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
            if (!cachedPromisifications.has(op)) { cachedPromisifications.set(op, pogo(op)) }
            cachedPromisifications.get(op).then(i => {
              if (!race.finished) { race.finished = true; bounce(i) }
            }, e => {
              if (!race.finished) { race.finished = true; toss(e) }
            })
          }
        })
        return
      }
      if (isGen(instr)) {
        if (!cachedPromisifications.has(instr)) { cachedPromisifications.set(instr, pogo(instr)) }
        cachedPromisifications.get(instr).then(bounce, toss)
        return
      }

      notOk(new Error(`Invalid yield instruction: ${instr}.`))
    }
  })
}


function isPromise(x) { return typeof x.then === 'function' }
function isGen(x) {
  return typeof x.next === 'function' && typeof x.throw === 'function'
}

export { chan, strictBuffer, slidingBuffer } from './channels'
export { put, race } from './ops'
