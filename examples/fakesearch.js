'use strict';

const csp = require("../index.js"),
      go = csp.go,
      put = csp.put,
      take = csp.take,
      alts = csp.alts;

const sleep = ms => new Promise((yep, nope) => setTimeout(yep, ms));

function fakeSearch(kind) {
  return function*(query) {
    yield sleep(Math.random() * 200);
    return kind  + " result for query " + query;
  };
}

var web1 = fakeSearch("web1");
var web2 = fakeSearch("web2");
var image1 = fakeSearch("image1");
var image2 = fakeSearch("image2");
var video1 = fakeSearch("video1");
var video2 = fakeSearch("video2");

function* first(query, replicas) {
  const ch = new csp.Unbuffered();
  function* searchReplica(i) {
    yield put(ch, (yield* replicas[i](query)));
  }
  for (var i = 0; i < replicas.length; i++) {
    go(searchReplica, [i]).catch(e => console.log("wtf", e));
  }
  return (yield ch);
}

function* google(query) {
  var ch = new csp.Unbuffered();

  go(function*() {
    yield put(ch, (yield* first(query, [web1, web2])));
  }).catch(e => console.log("wtf", e));
  go(function*() {
    yield put(ch, (yield* first(query, [image1, image2])));
  }).catch(e => console.log("wtf", e));
  go(function*() {
    yield put(ch, (yield* first(query, [video1, video2])));
  }).catch(e => console.log("wtf", e));

  var t = sleep(80);

  var results = [];
  for (var i = 0; i < 3; i++) {
    var r = yield alts([ch, t.then(() => "zzz")]);
    if (r.channel) {
      results.push(r.value);
    } else {
      console.log("timed out");
      break;
    }
  }

  return results;
}

go(function*() {
  var start = new Date();
  var results = yield* google("PLT");
  var elapsed = new Date() - start;
  console.log(results.join("\n"));
  console.log(elapsed);
}).catch(e => console.log("wtf", e));
