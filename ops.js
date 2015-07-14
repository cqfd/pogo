export class Put {
  constructor(ch, val) {
    this.ch = ch
    this.val = val
  }
}
export const put = (ch, val) => new Put(ch, val)

export class Race {
  constructor(ops) {
    this.ops = ops
  }
}
export const race = ops => new Race(ops)
