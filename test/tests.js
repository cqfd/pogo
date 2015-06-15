'use strict';

const assert = require("chai").assert;
const po = require('../index.js');
const wtf = x => console.log("wtf", x);

describe("returning a value", () => {
  it("resolves the pogo's promise", () => {
    return po.go(function*() { return 123; }).then(v => assert.equal(v, 123)); });
});

describe("raising an exception", () => {
  it("rejects the pogo's promise", () => {
    return po.go(function*() { throw "bang!"; }).catch(e => assert.equal(e, "bang!"));
  });
});

describe("yielding a promise", () => {
  describe("that resolves", () => {
    it("resumes the pogo with the resolution", () => {
      return po.go(function*() { assert.equal(yield Promise.resolve(123), 123)});
    });
  });

  describe("that rejects", () => {
    it("throws the rejection back into the pogo", () => {
      return po.go(function*() {
        try { yield Promise.reject("bang!"); }
        catch (e) { assert.equal(e, "bang!") }
      });
    });
  });
});

describe("yielding a put or a take", () => {
  it("resumes the pogo with a corresponding take or put", () => {
    const ch = po.chan();
    po.go(function*() {
      for (let i = 0; i < 10; i++) {
        yield po.put(ch, i)
      }
    });
    return po.go(function*() {
      for (let i = 0; i < 10; i++) {
        assert.equal(i, yield ch);
      }
    });
  });
});

describe("yielding an alts of promises", () => {
  it("works", () => {
    return po.go(function*() {
      const ret = yield po.alts([po.sleep(1000), Promise.resolve("woot")]);
      assert.equal(ret, "woot");
    });
  });
});

describe("yielding an alts", () => {
  it("works", () => {
    const log = [];
    const fooChan = po.chan();
    const barChan = po.chan();
    po.go(function*() {
      yield po.put(fooChan, "foo");
      log.push("put foo");
      yield po.put(barChan, "bar");
      log.push("put bar");
    });
    return po.go(function*() {
      const foo = yield po.alts([fooChan]);
      log.push("alted");
      assert.equal(foo.value, "foo");
      assert.equal(foo.channel, fooChan);

      const bar = yield po.alts([barChan, fooChan]);
      log.push("alted");
      assert.equal(bar.value, "bar");
      assert.equal(bar.channel, barChan);

      assert.deepEqual(log, ["put foo", "alted", "put bar", "alted"]);
    });
  });
});

describe("sharing a channel between multiple pogos", () => {
  it("works", () => {
    const log = [];
    const ch = po.chan();
    po.go(function*() {
      yield po.put(ch, "foo");
      log.push("put foo");
    }).catch(wtf);
    po.go(function*() {
      yield po.put(ch, "bar");
      log.push("put bar");
    }).catch(wtf);
    po.go(function*() {
      yield po.put(ch, "baz");
      log.push("put baz");
    }).catch(wtf);
    return po.go(function*() {
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
    const ch = po.chan();

    po.go(function*() {
      const ping = yield ch;
      log.push("received " + ping);
      yield po.put(ch, "pong");
      log.push("sent pong");
    }).catch(wtf);

    return po.go(function*() {
      yield po.put(ch, "ping");
      log.push("sent ping");
      const pong = yield ch;
      log.push("received " + pong);

      assert.deepEqual(log, ["received ping", "sent ping", "sent pong", "received pong"]);
    });
  });
});

describe("whoever got there first", () => {
  it("resumes first", () => {
    const log = [];
    const ch = po.chan();
    po.go(function*() {
      yield ch;
      log.push("took");
    });
    return po.go(function*() {
      yield po.put(ch);
      log.push("put");
    }).then(() => assert.deepEqual(log, ["took", "put"]));
  });
});
