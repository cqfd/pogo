'use strict'

export class Put {
  constructor(ch, val) {
    this.ch = ch
    this.val = val
  }
}

export class Race {
  constructor(ops) {
    this.ops = ops
  }
}
