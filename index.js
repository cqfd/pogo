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
    return instr.ch.waitForTaker(puter, (t, tWasFirst) => {
      if (tWasFirst) { resumeThem(); resumeUs(); } 
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

const put = (ch, val) => new Put(ch, val);
const take = ch => new Take(ch);
const alts = ops => new Promise((resolve, reject) => {
  let alive = true;
  for (let op of ops) {
    if (isPromise(op)) {
      op.then(i => { if (alive) { alive = false; resolve(i); } },
              e => { if (alive) { alive = false; reject(e); } });
    } else if (op instanceof Unbuffered) {
    } else if (op instanceof Take) {
    } else if (op instanceof Put) {
    }
  }
});

const isPromise = x => typeof x.then === 'function';
const isAlt = x => x.alts != undefined;
const isAlive = x => !isAlt(x) || x.alts.alive;
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function';

class Unbuffered {
  constructor() {
    this.putings = [];
    this.takers = [];
  }

  waitForTaker(puter, cb, eb) {
    this.takers = this.takers.filter(isAlive);

    if (!isAlive(puter)) return eb();
    if (!this.takers.length) return this.putings.push(cb);

    const taker = this.takers[0];
    const takerWasFirst = true;

    if (cb(taker, takerWasFirst)) this.takers.shift();
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
