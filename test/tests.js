'use strict';

const assert = require("chai").assert;
const pogo = require('../index.js'),
      alts = pogo.alts,
      chan = pogo.chan,
      put = pogo.put;
const wtf = x => console.log("wtf", x);
const sleep = ms => new Promise(yep => setTimeout(yep, ms));

describe("returning a value", () => {
  it("resolves the pogo's promise", () => {
    return pogo(function*() { return 123; }).then(v => assert.equal(v, 123)); });
});

describe("raising an exception", () => {
  it("rejects the pogo's promise", () => {
    return pogo(function*() { throw "bang!"; }).catch(e => assert.equal(e, "bang!"));
  });
});

describe("yielding a promise", () => {
  describe("that resolves", () => {
    it("resumes the pogo with the resolution", () => {
      return pogo(function*() { assert.equal(yield Promise.resolve(123), 123)});
    });
  });

  describe("that rejects", () => {
    it("throws the rejection back into the pogo", () => {
      return pogo(function*() {
        try { yield Promise.reject("bang!"); }
        catch (e) { assert.equal(e, "bang!") }
      });
    });
  });
});

describe("yielding a put or a take", () => {
  it("resumes the pogo with a corresponding take or put", () => {
    const ch = chan();
    pogo(function*() {
      for (let i = 0; i < 10; i++) {
        yield put(ch, i)
      }
    });
    return pogo(function*() {
      for (let i = 0; i < 10; i++) {
        assert.equal(i, yield ch);
      }
    });
  });
});

describe("alts", () => {
  it("works with promises", () => {
    return pogo(function*() {
      const ret = yield alts([sleep(1000), Promise.resolve("woot")]);
      assert.equal(ret, "woot");
    });
  });

  it("cancels slow alternatives", () => {
    const log = [];
    const ch1 = chan();
    const ch2 = chan();

    pogo(function*() {
      yield alts([put(ch1, "first"), put(ch2, "second")]);
      log.push("put first");
      yield put(ch2, "deuxieme");
      log.push("put deuxieme");
    }).catch(wtf);

    return pogo(function*() {
      const r1 = yield alts([ch1, ch2]);
      log.push("alted");
      assert.equal(r1.channel, ch1);
      assert.equal(r1.value, "first");

      const r2 = yield alts([ch1, ch2]);
      log.push("alted");
      assert.equal(r2.channel, ch2);
      assert.equal(r2.value, "deuxieme");

      assert.deepEqual(log, ["put first", "alted", "put deuxieme", "alted"]);
    });
  });
});

describe("sharing a channel between multiple pogos", () => {
  it("works", () => {
    const log = [];
    const ch = chan();
    pogo(function*() {
      yield put(ch, "foo");
      log.push("put foo");
    }).catch(wtf);
    pogo(function*() {
      yield put(ch, "bar");
      log.push("put bar");
    }).catch(wtf);
    pogo(function*() {
      yield put(ch, "baz");
      log.push("put baz");
    }).catch(wtf);
    return pogo(function*() {
      assert.equal(yield ch, "foo");
      log.push("took foo");
      assert.equal(yield ch, "bar");
      log.push("took bar");
      assert.equal(yield ch, "baz");
      log.push("took baz");
      assert.deepEqual(log, [
        "put foo", "took foo", "put bar", "took bar", "put baz", "took baz"
      ]);
    });
  });
});

describe("puting and taking from the same channel", () => {
  it("works", () => {
    const log = [];
    const ch = chan();

    pogo(function*() {
      const ping = yield ch;
      log.push("received " + ping);
      yield pogo.put(ch, "pong");
      log.push("sent pong");
    }).catch(wtf);

    return pogo(function*() {
      yield pogo.put(ch, "ping");
      log.push("sent ping");
      const pong = yield ch;
      log.push("received " + pong);

      assert.deepEqual(log, ["received ping", "sent ping", "sent pong", "received pong"]);
    });
  });
});

describe("fairness", () => {
  it("works for a take and then a put", () => {
    const log = [];
    const ch = chan();
    pogo(function*() {
      yield ch;
      log.push("took");
    });
    return pogo(function*() {
      yield put(ch);
      log.push("put");
    }).then(() => assert.deepEqual(log, ["took", "put"]));
  });

  it("works for a put and then a take", () => {
    const log = [];
    const ch = chan();
    pogo(function*() {
      yield put(ch);
      log.push("put");
    });
    return pogo(function*() {
      yield ch;
      log.push("took");
    }).then(() => assert.deepEqual(log, ["put", "took"]));
  });
});
