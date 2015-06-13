'use strict';

/*
 * The trampoline. (Lots of inspiration taken from github.com/tj/co.)
 */

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
  try { output = gen.next(input) }
  catch (e) { return gen.reject(e); }
  next(gen, output);
}

function toss(gen, error) {
  let output;
  try { output = gen.throw(error); }
  catch (e) { return gen.reject(e); }
  next(gen, output);
}

function next(gen, output) {
  const v = output.value;
  if ( output.done ) gen.resolve(v);
  else if ( isPromise(v) ) v.then(i => bounce(gen, i), e => toss(gen, e));
  else if ( isPut(v) ) v[0].put(gen, v[1]);
  else if ( isTake(v) ) v.take(gen);
  else gen.reject("Invalid yield in go block.");
}

/*
 * Go block operations.
 */

const put = (ch, val) => [ch, val];
const take = ch => ch;
const alts = ops => new Promise((resolve, reject) => {
  const alt = { alive: true, resolve: resolve };
  ops.forEach(op => {
    if ( isPromise(op) ) {
      op.then(v => { if ( alt.alive ) { alt.alive = false; resolve(v); } }, 
              e => { if ( alt.alive ) { alt.alive = false; reject(e); } });
    } else if ( isPut(op) ) { 
      op[0].put(alt, op[1]);
    } else if ( isTake(op) ) {
      op.take(alt);
    } else {
      throw "Unsupported alt operation."
    }
  });
});

const isPromise = x => typeof x.then === 'function';
const util = require('util');
const isChan = x => typeof x.put === 'function' && typeof x.take === 'function';
const isPut = x => util.isArray(x) && x.length == 2 && isChan(x[0]);
const isTake = isChan; 
const isAlt = x => x.alive != undefined && typeof x.resolve === 'function';
const isGen = x => typeof x.next === 'function' && typeof x.throw === 'function';

/*
 * Simple unbuffered channels.
 */

class Unbuffered {
  constructor() {
    this.putings = [];
    this.takers = [];
  }

  put(puter, val) {
    if ( isAlt(puter) && !puter.alive ) return;

    this.takers = this.takers.filter(t => isGen(t) || t.alive);
    if ( !this.takers.length ) return this.putings.push({ puter: puter, val: val });

    const taker = this.takers.shift();

    if ( isAlt(taker) && isAlt(puter) ) {
      taker.alive = puter.alive = false;
      taker.resolve({ channel: this, value: val });
      puter.resolve({ channel: this });
    } else if ( isAlt(taker) && isGen(puter) ) {
      taker.alive = false;
      taker.resolve({ channel: this, value: val });
      bounce(puter);
    } else if ( isGen(taker) && isAlt(puter) ) {
      puter.alive = false;
      bounce(taker, val);
      puter.resolve({ channel: this });
    } else {
      bounce(taker, val);
      bounce(puter);
    }
  }

  take(taker) {
    if ( isAlt(taker) && !taker.alive ) return;

    this.putings = this.putings.filter(p => isGen(p.puter) || p.puter.alive);
    if ( !this.putings.length ) return this.takers.push(taker);

    const puting = this.putings.shift(),
          puter = puting.puter;

    if ( isAlt(puter) && isAlt(taker) ) {
      puter.alive = taker.alive = false;
      puter.resolve({ channel: this });
      taker.resolve({ channel: this, value: puting.val });
    } else if ( isAlt(puter) && isGen(taker) ) {
      puter.alive = false;
      puter.resolve({ channel: this });
      bounce(taker, puting.val);
    } else if ( isGen(puter) && isAlt(taker) ) {
      taker.alive = false;
      bounce(puter);
      taker.resolve({ channel: this, value: puting.val });
    } else {
      bounce(puter);
      bounce(taker, puting.val);
    }
  }
}

module.exports = {
  go: go,
  put: put,
  take: take,
  alts: alts,
  Unbuffered: Unbuffered
};
