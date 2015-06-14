'use strict';

const assert = require('assert');
const invariant = (msg, assertion) => {
  console.log("Invariant:", msg);
  assert(assertion, msg);
}

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
    return instr.take().then(i => bounce(gen, i), e => console.log("wtf", e));
  }

  if (instr instanceof Put) {
    return instr.ch.put(instr.val).then(() => bounce(gen), e => console.log("wtf", e));
  }

  gen.reject(new Error("Invalid instruction: " + instr + "."));
}

class Put {
  constructor(ch, val) {
    this.ch = ch;
    this.val = val;
  }
}
const put = (ch, val) => new Put(ch, val);

const isPromise = x => typeof x.then === 'function';
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function';

class Unbuffered {

  constructor() {
    this.takings = [];
    this.putings = [];
  }

  put(val) {
    const takings = this.takings;
    const putings = this.putings;
    return new Promise((resolve, reject) => {
      if (!takings.length) {
        return putings.push({ val: val, resolve: resolve, reject: reject });
      }
      const taking = takings.shift();
      taking.resolve(val);
      resolve();
    });
  }

  take() {
    const takings = this.takings;
    const putings = this.putings;
    return new Promise((resolve, reject) => {
      if (!putings.length) {
        return takings.push({ resolve: resolve, reject: reject });
      }
      const puting = putings.shift();
      puting.resolve();
      resolve(puting.val);
    });
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const chan = () => new Unbuffered();

module.exports = {
  go: go,
  put: put,
  sleep: sleep,
  chan: chan
};
