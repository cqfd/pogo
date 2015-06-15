"use strict";

// http://talks.golang.org/2012/concurrency.slide#39
// Daisy-chain
const pogo = require("../index.js");

function* chain(left, right) {
  yield pogo.put(left, 1 + (yield right));
}

pogo(function*() {
  const n = 100000;
  const leftmost = pogo.chan();
  let right = leftmost;
  let left = leftmost;

  // Start the goroutines
  for (let i = 0; i < n; i++) {
    right = pogo.chan();
    pogo(chain, [left, right]);
    left = right;
  }

  // Start the chain
  pogo(function*() {
    yield pogo.put(right, 1);
  });

  console.log((yield leftmost));
});
