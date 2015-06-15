'use strict';

const po = require('./index.js');
const wtf = e => console.log("wtf", e);


const sleep = ms => new Promise(yep => setTimeout(yep, ms));

function boring(msg) {
  const ch = po.chan();
  po.go(function*() {
    for (let i = 0;; i++) {
      yield po.put(ch, msg + " " + i);
      yield sleep(Math.random() * 1000);
    }
  }).catch(e => console.log("boring wtf", e));
  return ch;
}

function fanIn(in1, in2) {
  const ch = po.chan();
  po.go(function*() {
    for (;;) {
      const r = yield po.alts([in1, in2]);
      yield po.put(ch, r.value);
    }
  }).catch(e => console.log("fanIn wtf", e));
  return ch;
}

po.go(function*() {
  const ch = fanIn(boring("sup"), boring("yo"));
  for (let i = 0; i < 10; i++) {
    console.log(yield ch);
  }
}).catch(e => console.log("main wtf", e));
