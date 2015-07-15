'use strict'

import { StrictBuffer } from './buffers'

export default class Channel {
  constructor(buf) {
    this.pendingTakings = []
    this.pendingPutings = []
    this.bufferedPutings = buf || new StrictBuffer(0)
  }

  _take(taker, ok, notOk) {
    if (taker.finished) { notOk(); return }

    this._disqualifySlowRacers()

    const bufferedPuting = this.bufferedPutings.remove()
    if (bufferedPuting) {
      if (bufferedPuting.puter.finished !== undefined) {
        bufferedPuting.puter.finished = true
      }
      bufferedPuting.ok()

      const pendingPuting = this.pendingPutings.shift()
      if (pendingPuting) {
        this.bufferedPutings.add(pendingPuting)
        if (pendingPuting.puter.finished !== undefined) {
          pendingPuting.puter.finished = true
        }
        pendingPuting.ok()
      }

      ok(bufferedPuting.value)
    } else {
      const pendingPuting = this.pendingPutings.shift()
      if (pendingPuting) {
        if (pendingPuting.puter.finished !== undefined) {
          pendingPuting.puter.finished = true
        }
        pendingPuting.ok()

        if (taker.finished !== undefined) {
          taker.finished = true
        }
        ok(pendingPuting.value)
      }
      else {
        this.pendingTakings.push({taker, ok, notOk})
      }
    }
  }

  _put(puter, value, ok, notOk) {
    if (puter.finished) { notOk(); return }

    this._disqualifySlowRacers()

    const pendingTaking = this.pendingTakings.shift()
    if (pendingTaking) {
      if (pendingTaking.taker.finished !== undefined) {
        pendingTaking.taker.finished = true
      }
      pendingTaking.ok(value)

      if (puter.finished !== undefined) {
        puter.finished = true
      }
      ok()
    } else {
      const puting = {puter, ok, notOk, value}
      if (this.bufferedPutings.add(puting)) {
        ok()
      } else {
        this.pendingPutings.push(puting)
      }
    }
  }

  put(puter, value) { return new Promise(this._put.bind(this, puter, value)) }
  putAsync(value, ok = noOp) { this._put('async', value, ok) }

  take(taker) { return new Promise(this._take.bind(this, taker)) }
  takeAsync(ok = noOp) { return this._take('async', ok) }

  _disqualifySlowRacers() {
    for (let t of this.pendingTakings) {
      if (t.taker.finished) { t.notOk() }
    }
    this.pendingTakings = this.pendingTakings.filter(t => !t.taker.finished)

    for (let p of this.pendingPutings) {
      if (p.puter.finished) { p.notOk() }
    }
    this.pendingPutings = this.pendingPutings.filter(p => !p.puter.finished)
  }
}

function noOp() {}
