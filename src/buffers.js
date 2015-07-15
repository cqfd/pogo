'use strict'

export class StrictBuffer {
  constructor(capacity) {
    this.capacity = capacity
    this.buf = []
  }

  empty() { return this.buf.length === 0 }

  add(val) {
    if (this.buf.length === this.capacity) { return false }

    this.buf.push(val)
    return true
  }
  remove() { return this.buf.shift() }
}

export class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity
    this.buf = []
    this.offset = 0
  }

  empty() { return this.buf[this.offset] === undefined }

  add(val) {
    this.buf[this.offset] = val
    this.offset = (this.offset + 1) % this.capacity
    return true
  }
  remove() {
    const ret = this.buf[this.offset]
    this.offset = (this.offset - 1) % this.capacity
    return ret
  }
}
