'use strict';

var csp = require('./index.js');

const sleep = ms => new Promise((yep, nope) => setTimeout(yep, ms));

function boring(msg) {
  const ch = new csp.Unbuffered();
  csp.go(function*() {
    for (let i = 0;; i++) {
      yield csp.put(ch, msg + " " + i);
      yield sleep(Math.random() * 1000);
    }
  }).catch(e => console.log("wtf", e));
  return ch;
}

function fanIn(in1, in2) {
  const ch = new csp.Unbuffered();
  csp.go(function*() {
    for (;;) {
      const r = yield csp.alts([in1, in2]);
      yield csp.put(ch, r.value);
    }
  }).catch(e => console.log("wtf", e));
  return ch;
}

csp.go(function*() {
  const ch = fanIn(boring("sup"), boring("yo"));
  for (let i = 0; i < 10; i++) {
    console.log(yield ch);
  }
}).catch(e => console.log("wtf", e));
