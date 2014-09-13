function music(a, b) {
  return flattern(range(1 << a).map(function(n) {
    return bitArray(n, a);
  }).filter(function(list) {
    return list[0] === 1 && sum(list) === b;
  }).map(bitIndex)).map(function(n, i) {
    return((i + 1) % n)|0;
  });
}

function range(n) {
  var a = new Array(n);

  for (var i = 0; i < n; i++) {
    a[i] = i;
  }

  return a;
}

function bitArray(n, bits) {
  var result = new Array(bits);

  for (var i = 0; i < bits; i++) {
    result[i] = n & (1 << i) ? 0 : 1;
  }

  return result;
}

function sum(list) {
  return list.reduce(function(a, b) {
    return a + b;
  }, 0);
}

function bitIndex(list) {
  return list.map(function(x, i) {
    return x * (1 << i);
  }).reverse();
}


function flattern(list) {
  return list.reduce(function(a, b) {
    return a.concat(b);
  }, []);
}
