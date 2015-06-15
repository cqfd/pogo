'use strict';

const po = require('../index.js'),
      put = po.put,
      sleep = ms => new Promise(yep => setTimeout(yep, ms));

function* player(name, table) {
  while (true) {
    const ball = yield table;
    console.log("ball:", ball);
    if (ball === "deflated") {
      console.log(name + ": the ball popped :(");
      return;
    }
    ball.hits += 1;
    yield sleep(100);
    yield put(table, ball);
  }
}

po.go(function* () {
  var table = po.chan();

  po.go(player, ["ping", table]).catch(e => console.log("ping wtf:", e));
  po.go(player, ["pong", table]).catch(e => console.log("pong wtf:", e));

  yield po.put(table, {hits: 0});
  yield po.sleep(1000);
  yield po.put(table, "deflated");
}).catch(e => console.log("game wtf:", e));
