'use strict';

const assert = require('assert');
const wtf = e => console.log("wtf", e);

function go(star, args) {
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
    return instr.take(gen).then(i => bounce(gen, i), wtf);
  }

  if (instr instanceof Put) {
    return instr.ch.put(gen, instr.val).then(() => bounce(gen), wtf);
  }

  if (instr instanceof Alts) {
    const alt = { isLive: true };
    for (let op of instr.ops) {
      if (isPromise(op)) {
        op.then(i => {
          if (alt.isLive) {
            alt.isLive = false;
            bounce(gen, i);
          }
        }, e => {
          if (alt.isLive) {
            alt.isLive = false;
            toss(gen, e);
          }
        });
      }

      if (op instanceof Unbuffered) {
        op.take(alt).then(i => {
          alt.isLive = false;
          bounce(gen, { value: i, channel: op })
        }, wtf);
      }

      if (op instanceof Put) {
        op.ch.put(alt, instr.val).then(() => {
          alt.isLive = false;
          bounce(gen, { channel: op });
        }, wtf);
      }
    }
    return;
  }

  gen.reject(new Error("Invalid yield instruction: " + instr + "."));
}

class Put {
  constructor(ch, val) {
    this.ch = ch;
    this.val = val;
  }
}
const put = (ch, val) => new Put(ch, val);

class Alts {
  constructor(ops) {
    this.ops = ops;
  }
}
const alts = ops => new Alts(ops);

const isPromise = x => typeof x.then === 'function';
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function';
const isLive = x => {
  const alive = x.isLive || x.isLive === undefined;
  if (!alive) console.log("Found something dead!", x);
  return alive;
}

class Unbuffered {

  constructor() {
    this.takings = [];
    this.putings = [];
  }

  put(puter, val) {
    this.takings = this.takings.filter(isLive);
    const takings = this.takings;
    const putings = this.putings;
    return new Promise((resolve, reject) => {
      if (!takings.length) {
        return putings.push({
          val: val,
          resolve: resolve,
          reject: reject,
          isLive: puter.isLive
        });
      }
      const taking = takings.shift();
      taking.resolve(val);
      resolve();
    });
  }

  take(taker) {
    this.putings = this.putings.filter(isLive);
    const takings = this.takings;
    const putings = this.putings;
    return new Promise((resolve, reject) => {
      if (!putings.length) {
        return takings.push({
          resolve: resolve,
          reject: reject,
          isLive: taker.isLive
        });
      }
      const puting = putings.shift();
      puting.resolve();
      resolve(puting.val);
    });
  }
}

const chan = () => new Unbuffered();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  go: go,
  put: put,
  alts: alts,
  sleep: sleep,
  chan: chan
};
