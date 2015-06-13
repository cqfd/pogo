You can run the examples with `iojs --harmony_arrow_functions`.

```javascript
const po = require('./index.js');

const sleep = ms => new Promise((yep, nope) => setTimeout(yep, ms));

po.go(function*() {
  while ( true ) {
    console.log("tick");
    yield sleep(1000);
    console.log("tock");
    yield sleep(1000);
  }
}).catch(e => console.log("tick tock wtf:", e));

function* player(name, table) {
  while (true) {
    const ball = yield table;
    if (ball === "deflated") {
      console.log(name + ": the ball popped :(");
      return;
    }
    ball.hits += 1;
    console.log(name + " " + ball.hits);
    yield sleep(100);
    yield po.put(table, ball);
  }
}

po.go(function* () {
  var table = new po.Unbuffered();

  po.go(player, ["ping", table]).catch(e => console.log("ping wtf:", e));
  po.go(player, ["pong", table]).catch(e => console.log("pong wtf:", e));

  yield po.put(table, {hits: 0});
  yield sleep(1000);

  yield po.put(table, "deflated");
}).catch(e => console.log("game wtf:", e));

```
