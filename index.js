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
  next(gen, output.value, output.done);
}

function toss(gen, error) {
  let output;
  try { output = gen.throw(error); }
  catch (e) { return gen.reject(e); }
  next(gen, output.value, output.done);
}

function next(gen, instr, done) {
  if (done) return gen.resolve(instr);
  if (isPromise(instr)) return instr.then(i => bounce(gen, i), e => toss(gen, e));
  if (instr instanceof Unbuffered) return instr.registerTaker({ gen: gen });
  if (instr instanceof Take) return instr.ch.registerTaker({ gen: gen });
  if (instr instanceof Put) {
    const puter = { gen: gen };
    return instr.ch.waitForTaker(puter).then(t => {
      if (t.wasFirst) { resumeThem(); resumeUs(); } 
      else { resumeUs(); resumeThem(); }

      function resumeUs() { bounce(gen); }
      function resumeThem() {
        if (t.alt) {
          invariant("Alternative take must be alive.", t.alt.alive);
          t.alt.alive = false;
        }
        bounce(t.gen, instr.val);
      }
    });
  }
  gen.reject(new Error("Invalid instruction: " + instr + "."));
}

class Put {
  constructor(ch, val) {
    this.ch = ch;
    this.val = val;
  }
}

class Take {
  constructor(ch) {
    this.ch = ch;
  }
}

class Alts {
  constructor(ops) {
    this.ops = ops;
    this.alive = true;
  }
}

const put = (ch, val) => new Put(ch, val);
const take = ch => new Take(ch);
const alts = ops => new Alts(ops);

const isPromise = x => typeof x.then === 'function';
const isAlt = x => x.alts != undefined;
const isAlive = x => !isAlt(x) || x.alts.alive;
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function';

class Unbuffered {
  /*
   * taker: { gen, alts }
   * puter: { gen, alts }
   * puting: promise resolver
   */

  constructor() {
    this.putings = [];
    this.takers = [];
  }

  waitForTaker(puter) {
    this.takers = this.takers.filter(isAlive);
    const takers = this.takers;
    const putings = this.putings;
    return new Promise((resolve, reject) => {
      if (!isAlive(puter)) return reject();
      if (!takers.length) return putings.push(resolve);
      const taker = takers.shift();
      taker.wasFirst = true;
      resolve(taker);
    });
  }

  registerTaker(taker) {
    if (!isAlive(taker)) return;
    if (!this.putings.length) return this.takers.push(taker);
    const resolve = this.putings.shift();
    taker.wasFirst = false;
    resolve(taker);
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const chan = () => new Unbuffered();

module.exports = {
  go: go,
  put: put,
  take: take,
  alts: alts,
  sleep: sleep,
  chan: chan
};
