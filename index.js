'use strict';

module.exports = pogo.pogo = pogo;

function pogo(star, args) {
  return new Promise((resolve, reject) => {
    const gen = star.apply(null, args);
    gen.resolve = resolve;
    gen.reject = reject;
    bounce(gen);
  });
}

function bounce(gen, input) {
  let output;
  try { output = gen.next(input); }
  catch (e) { return gen.reject(e); }
  if (output.done) return gen.resolve(output.value);
  next(gen, output.value);
}

function toss(gen, error) {
  let output;
  try { output = gen.throw(error); }
  catch (e) { return gen.reject(e); }
  if (output.done) return gen.resolve(output.value);
  next(gen, output.value);
}

function next(gen, instr) {
  if (isPromise(instr)) {
    return instr.then(i => bounce(gen, i), e => toss(gen, e));
  }
  if (instr instanceof Unbuffered) {
    return instr.take(gen).then(i => bounce(gen, i));
  }
  if (instr instanceof Put) {
    return instr.ch.put(gen, instr.val).then(() => bounce(gen));
  }
  if (instr instanceof Alts) {
    const alt = { isLive: true };
    return instr.ops.forEach(op => {
      if (isPromise(op)) {
        op.then(i => { if (alt.isLive) { alt.isLive = false; bounce(gen, i); } },
                e => { if (alt.isLive) { alt.isLive = false; toss(gen, e); } });
      }

      if (op instanceof Unbuffered) {
        op.take(alt).then(i => bounce(gen, { value: i, channel: op }));
      }

      if (op instanceof Put) {
        op.ch.put(alt, op.val).then(() => bounce(gen, { channel: op }));
      }
    });
  }

  gen.reject(new Error("Invalid yield instruction: " + instr + "."));
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

const isPromise = x => typeof x.then === 'function';
const isAlt = x => x.isLive != undefined;
const isLive = x => x.isLive || x.isLive === undefined;

class Unbuffered {

  constructor() {
    this.takings = [];
    this.putings = [];
  }

  put(puter, val) {
    this.takings = this.takings.filter(t => isLive(t.er));
    const takings = this.takings;
    const putings = this.putings;
    return new Promise((resolve, reject) => {
      if (!isLive(puter)) return reject();

      if (!takings.length) {
        return putings.push({
          val: val,
          er: puter,
          resolve: resolve,
          reject: reject
        });
      }

      const taking = takings.shift();
      if (isAlt(taking.er)) taking.er.isLive = false;
      taking.resolve(val);

      if (isAlt(puter)) puter.isLive = false;
      resolve();
    });
  }

  take(taker) {
    this.putings = this.putings.filter(p => isLive(p.er));
    const takings = this.takings;
    const putings = this.putings;
    return new Promise((resolve, reject) => {
      if (!isLive(taker)) return reject();

      if (!putings.length) {
        return takings.push({
          er: taker,
          resolve: resolve,
          reject: reject,
        });
      }

      const puting = putings.shift();
      if (isAlt(puting.er)) puting.er.isLive = false;
      puting.resolve();

      if (isAlt(taker)) taker.isLive = false;
      resolve(puting.val);
    });
  }
}

pogo.chan = () => new Unbuffered();
