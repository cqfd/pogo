"use strict";

// http://talks.golang.org/2012/concurrency.slide#39
// Daisy-chain
const po = require("./index.js");

function* chain(left, right) {
  yield po.put(left, 1 + (yield right));
}

po.go(function*() {
  const n = 100000;
  const leftmost = po.chan();
  let right = leftmost;
  let left = leftmost;

  // Start the goroutines
  for (let i = 0; i < n; i++) {
    right = po.chan();
    po.go(chain, [left, right]);
    left = right;
  }

  // Start the chain
  po.go(function*() {
    yield po.put(right, 1);
  });

  console.log((yield leftmost));
});
