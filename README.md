You can run the examples with `iojs --harmony_arrow_functions`.

```javascript
'use strict';

const pogo = require('./index.js'),
      chan = pogo.chan,
      put = pogo.put,
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

pogo(function* () {
  var table = chan();

  pogo(player, ["ping", table]).catch(e => console.log("ping wtf:", e));
  pogo(player, ["pong", table]).catch(e => console.log("pong wtf:", e));

  yield put(table, {hits: 0});
  yield sleep(1000);
  yield put(table, "deflated");
}).catch(e => console.log("game wtf:", e));
```
