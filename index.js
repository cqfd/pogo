'use strict';

module.exports = pogo.pogo = pogo;

function pogo(star, args) {
  const gen = star.apply(null, args);
  return new Promise((resolve, reject) => {
    bounce();

    function bounce(input) {
      let output;
      try { output = gen.next(input); }
      catch (e) { return reject(e); }
      if (output.done) return resolve(output.value);
      next(output.value);
    }

    function toss(error) {
      let output;
      try { output = gen.throw(error); }
      catch (e) { return reject(e); }
      if (output.done) return resolve(output.value);
      next(output.value);
    }

    function next(instr) {
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
        });
      }
      reject(new Error("Invalid yield instruction: " + instr + "."));
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
