'use strict';

const promiseFor = new WeakMap();

export default function pogo(star, args) {
  const gen = isGen(star) ? star : star.apply(null, args);
  return new Promise((ok, notOk) => {
    bounce();

    function bounce(input) { decode(gen.next(input)) }
    function toss(error) { decode(gen.throw(error)) }

    function decode(output) {
      if (output.done) return ok(output.value);

      const instr = output.value;
      if (isPromise(instr)) return instr.then(bounce, toss);
      if (instr instanceof Unbuffered) return instr.take(gen).then(bounce);
      if (instr instanceof Put) return instr.ch.put(gen, instr.val).then(bounce);
      if (instr instanceof Alts) {
        const alt = { isLive: true };
        return instr.ops.forEach(op => {
          if (isPromise(op)) {
            op.then(i => { if (alt.isLive) { alt.isLive = false; bounce(i); } },
                    e => { if (alt.isLive) { alt.isLive = false; toss(e); } });
          }
          if (op instanceof Unbuffered) {
            op.take(alt).then(i => bounce({ value: i, channel: op }));
          }
          if (op instanceof Put) {
            op.ch.put(alt, op.val).then(() => bounce({ channel: op }));
          }
          if (isGen(op)) {
            if (!promiseFor.has(op)) promiseFor.set(op, pogo(op));
            promiseFor.get(op).then(i => { if (alt.isLive) { alt.isLive = false; bounce(i) } },
                                    e => { if (alt.isLive) { alt.isLive = false; toss(e) } });
          }
        });
      }
      if (isGen(instr)) {
        if (!promiseFor.has(instr)) promiseFor.set(instr, pogo(instr));
        return promiseFor.get(instr).then(bounce, toss);
      }

      notOk(new Error("Invalid yield instruction: " + instr + "."));
    }
  });
}

class Put {
  constructor(ch, val) {
    this.ch = ch;
    this.val = val;
  }
}
pogo.put = (ch, val) => new Put(ch, val);

class Alts {
  constructor(ops) {
    this.ops = ops;
  }
}
pogo.alts = ops => new Alts(ops);

class Unbuffered {

  constructor() {
    this.takings = [];
    this.putings = [];
  }

  put(puter, val) {
    this.takings = this.takings.filter(t => isLive(t.taker));
    return new Promise((resolve, reject) => {
      if (!isLive(puter)) return reject();

      if (!this.takings.length) {
        return this.putings.push({
          val: val,
          puter: puter,
          resolve: resolve,
          reject: reject
        });
      }

      const taking = this.takings.shift();
      if (isAlt(taking.taker)) taking.taker.isLive = false;
      taking.resolve(val);

      if (isAlt(puter)) puter.isLive = false;
      resolve();
    });
  }

  putAsync(val, cb) {
    const resolve = cb || (() => {});
    this.takings = this.takings.filter(t => isLive(t.taker));

    if (!this.takings.length) {
      return this.putings.push({
        val: val,
        puter: 'async',
        resolve: resolve
      });
    }

    const taking = this.takings.shift();
    if (isAlt(taking.taker)) taking.taker.isLive = false;
    taking.resolve(val);

    resolve();
  }

  take(taker) {
    this.putings = this.putings.filter(p => isLive(p.puter));
    return new Promise((resolve, reject) => {
      if (!isLive(taker)) return reject();

      if (!this.putings.length) {
        return this.takings.push({
          taker: taker,
          resolve: resolve,
          reject: reject,
        });
      }

      const puting = this.putings.shift();
      if (isAlt(puting.puter)) puting.puter.isLive = false;
      puting.resolve();

      if (isAlt(taker)) taker.isLive = false;
      resolve(puting.val);
    });
  }

  takeAsync(cb) {
    const resolve = cb || (() => {});
    this.putings = this.putings.filter(p => isLive(p.puter));

    if (!this.putings.length) {
      return this.takings.push({ taker: 'async', resolve: resolve });
    }

    const puting = this.putings.shift();
    if (isAlt(puting.puter)) puting.puter.isLive = false;
    puting.resolve();

    resolve(puting.val);
  }
}
pogo.chan = () => new Unbuffered();

const isPromise = x => typeof x.then === 'function';
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function';
const isAlt = x => x.isLive != undefined;
const isLive = x => x.isLive || x.isLive === undefined;
