'use strict';

const pogo = require('../index.js');
const wtf = e => console.log("wtf", e);


const sleep = ms => new Promise(yep => setTimeout(yep, ms));

function boring(msg) {
  const ch = pogo.chan();
  pogo(function*() {
    for (let i = 0;; i++) {
      yield pogo.put(ch, msg + " " + i);
      yield sleep(Math.random() * 1000);
    }
  }).catch(e => console.log("boring wtf", e));
  return ch;
}

function fanIn(in1, in2) {
  const ch = pogo.chan();
  pogo(function*() {
    for (;;) {
      const r = yield pogo.alts([in1, in2]);
      yield pogo.put(ch, r.value);
    }
  }).catch(e => console.log("fanIn wtf", e));
  return ch;
}

pogo(function*() {
  const ch = fanIn(boring("sup"), boring("yo"));
  for (let i = 0; i < 10; i++) {
    console.log(yield ch);
  }
}).catch(e => console.log("main wtf", e));
