'use strict'

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

export const strictBuffer = capacity => new Buffer(capacity)

export class Channel {
  constructor(buf) {
    this.takings = []
    this.putings = buf || new Buffer(0)
  }

  _take(taker, ok, notOk) {
    if (taker.finished) { return notOk() }

    this._disqualifySlowRacers()
    if (!this.putings.empty()) {
      const puting = this.putings.shift()
      if (puting.alreadyResumed) { return ok(puting.value) }
      if (puting.puter.finished !== undefined) { puting.puter.finished = true }
      puting.ok()

      if (taker.finished !== undefined) { taker.finished = true }
      ok(puting.value)
    } else {
      this.takings.push({taker, ok, notOk})
    }
  }

  _put(puter, value, ok, notOk) {
    if (puter.finished) { return notOk() }

    this._disqualifySlowRacers()
    if (this.takings.length) {
      const taking = this.takings.shift()
      if (taking.taker.finished !== undefined) { taking.taker.finished = true }
      taking.ok(value)
      if (puter.finished !== undefined) { puter.finished = true }
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
      if (t.taker.finished) { t.notOk() }
    }
    this.takings = this.takings.filter(t => !t.taker.finished)
    for (let p of this.putings) {
      if (!p.alreadyResumed && p.puter.finished) { p.notOk() }
    }
    this.putings.filter(p => p.alreadyResumed || !p.puter.finished)
  }
}
export const chan = buf => new Channel(buf)


class SlidingBuffer extends Buffer {
  underCapacity() { return true }
  push(x) {
    if (this.buf.length >= this.capacity) { this.buf.shift() }
    this.buf.push(x)
  }
}
export const slidingBuffer = capacity => new SlidingBuffer(capacity)

function noOp() {}
