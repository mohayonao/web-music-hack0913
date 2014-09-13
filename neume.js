(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var neume = require("./src/neume");

neume.use(require("./src/ugen/index"));

if (typeof window !== "undefined") {
  window.Neume = neume.Neume;
}

module.exports = neume;

},{"./src/neume":9,"./src/ugen/index":27}],2:[function(require,module,exports){
"use strict";

var _ = require("./utils");
var FFT = require("./fft");

function NeuBuffer(context, buffer) {
  this.$context = context;
  this.$buffer = buffer;

  Object.defineProperties(this, {
    sampleRate: {
      value: this.$buffer.sampleRate,
      enumerable: true
    },
    length: {
      value: this.$buffer.length,
      enumerable: true
    },
    duration: {
      value: this.$buffer.duration,
      enumerable: true
    },
    numberOfChannels: {
      value: this.$buffer.numberOfChannels,
      enumerable: true
    },
  });

  for (var i = 0; i < this.$buffer.numberOfChannels; i++) {
    Object.defineProperty(this, i, {
      value: this.$buffer.getChannelData(i)
    });
  }
}

NeuBuffer.create = function(context, channels, length, sampleRate) {
  channels   = _.int(_.defaults(channels, 1));
  length     = _.int(_.defaults(length, 0));
  sampleRate = _.int(_.defaults(sampleRate, context.sampleRate));

  return new NeuBuffer(context, context.createBuffer(channels, length, sampleRate));
};

NeuBuffer.fill = function(context, length, func) {
  length = _.int(_.defaults(length, 0));

  if (!_.isFunction(func)) {
    var value = _.finite(func);
    func = function() {
      return value;
    };
  }

  var buffer = context.createBuffer(1, length, context.sampleRate);
  var chData = buffer.getChannelData(0);

  for (var i = 0, imax = length; i < imax; i++) {
    chData[i] = func(i, imax);
  }

  return new NeuBuffer(context, buffer);
};

NeuBuffer.from = function(context, data) {
  var buffer = context.createBuffer(1, data.length, context.sampleRate);
  var chData = buffer.getChannelData(0);

  for (var i = 0, imax = data.length; i < imax; i++) {
    chData[i] = data[i];
  }

  return new NeuBuffer(context, buffer);
};

NeuBuffer.load = function(context, url) {
  return new window.Promise(function(resolve, reject) {
    loadWithXHR(url).then(function(audioData) {
      return decodeAudioData(context, audioData);
    }).then(function(decodedData) {
      resolve(new NeuBuffer(context, decodedData));
    }).catch(function(e) {
      reject(e);
    });
  });
};

function loadWithXHR(url) {
  return new window.Promise(function(resolve, reject) {
    var xhr = new window.XMLHttpRequest();

    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";

    xhr.onload = function() {
      resolve(xhr.response);
    };

    xhr.onerror = function() {
      reject({/* TODO: error object */});
    };

    xhr.send();
  });
}

function decodeAudioData(context, audioData) {
  return new window.Promise(function(resolve, reject) {
    _.findAudioContext(context).decodeAudioData(audioData, function(decodedData) {
      resolve(decodedData);
    }, function() {
      reject({/* TODO: error object */});
    });
  });
}

NeuBuffer.prototype.getChannelData = function(ch) {
  ch = Math.max(0, Math.min(_.int(ch), this.numberOfChannels - 1));

  return this.$buffer.getChannelData(ch);
};

NeuBuffer.prototype.concat = function() {
  var args = _.toArray(arguments).filter(function(elem) {
    return (elem instanceof NeuBuffer) && (this.numberOfChannels === elem.numberOfChannels);
  }, this);
  var channels = this.numberOfChannels;
  var length = args.reduce(function(a, b) {
    return a + b.length;
  }, this.length);
  var sampleRate = this.sampleRate;
  var buffer = this.$context.createBuffer(channels, length, sampleRate);

  args.unshift(this);

  var argslen = args.length;

  for (var i = 0; i < channels; i++) {
    var data = buffer.getChannelData(i);
    var pos  = 0;
    for (var j = 0; j < argslen; j++) {
      data.set(args[j][i], pos);
      pos += args[j].length;
    }
  }

  return new NeuBuffer(this.$context, buffer);
};

NeuBuffer.prototype.reverse = function() {
  var channels = this.numberOfChannels;
  var buffer = this.$context.createBuffer(channels, this.length, this.sampleRate);

  for (var i = 0; i < channels; i++) {
    buffer.getChannelData(i).set(_.toArray(this[i]).reverse());
  }

  return new NeuBuffer(this.$context, buffer);
};

NeuBuffer.prototype.slice = function(start, end) {
  start = _.int(_.defaults(start, 0));
  end   = _.int(_.defaults(end  , this.length));

  if (start < 0) {
    start += this.length;
  } else {
    start = Math.min(start, this.length);
  }
  if (end < 0) {
    end += this.length;
  } else {
    end = Math.min(end, this.length);
  }

  var channels = this.numberOfChannels;
  var length = end - start;
  var sampleRate = this.sampleRate;
  var buffer = null;

  if (length <= 0) {
    buffer = this.$context.createBuffer(channels, 1, sampleRate);
  } else {
    buffer = this.$context.createBuffer(channels, length, sampleRate);
    for (var i = 0; i < channels; i++) {
      buffer.getChannelData(i).set(this[i].subarray(start, end));
    }
  }

  return new NeuBuffer(this.$context, buffer);
};

NeuBuffer.prototype.split = function(n) {
  n = _.int(_.defaults(n, 2));

  if (n <= 0) {
    return [];
  }

  var result = new Array(n);
  var len = this.length / n;
  var start = 0;
  var end   = 0;

  for (var i = 0; i < n; i++) {
    end = Math.round(start + len);
    result[i] = this.slice(start, end);
    start = end;
  }

  return result;
};

NeuBuffer.prototype.normalize = function() {
  var channels = this.numberOfChannels;
  var buffer = this.$context.createBuffer(channels, this.length, this.sampleRate);

  for (var i = 0; i < channels; i++) {
    buffer.getChannelData(i).set(normalize(this[i]));
  }

  return new NeuBuffer(this.$context, buffer);
};

NeuBuffer.prototype.resample = function(size, interpolation) {
  size = Math.max(0, _.int(_.defaults(size, this.length)));
  interpolation = !interpolation;

  var channels = this.numberOfChannels;
  var buffer = this.$context.createBuffer(channels, size, this.sampleRate);

  for (var i = 0; i < channels; i++) {
    buffer.getChannelData(i).set(resample(this[i], size, interpolation));
  }

  return new NeuBuffer(this.$context, buffer);
};

NeuBuffer.prototype.toPeriodicWave = function(ch) {
  ch = Math.max(0, Math.min(_.int(ch), this.numberOfChannels - 1));

  var buffer = this.$buffer.getChannelData(ch);

  if (4096 < buffer.length) {
    buffer = buffer.subarray(0, 4096);
  }

  var fft = FFT.forward(buffer);

  return this.$context.createPeriodicWave(fft.real, fft.imag);
};

function normalize(data) {
  var maxamp = peak(data);

  /* istanbul ignore else */
  if (maxamp !== 0) {
    var ampfac = 1 / maxamp;
    for (var i = 0, imax = data.length; i < imax; ++i) {
      data[i] *= ampfac;
    }
  }

  return data;
}

function peak(data) {
  var maxamp = 0;

  for (var i = 0, imax = data.length; i < imax; ++i) {
    var absamp = Math.abs(data[i]);
    if (maxamp < absamp) {
      maxamp = absamp;
    }
  }

  return maxamp;
}

function resample(data, size, interpolation) {
  if (data.length === size) {
    return new Float32Array(data);
  }

  if (interpolation) {
    return resample0(data, size);
  }

  return resample1(data, size);
}

function resample0(data, size) {
  var factor = (data.length - 1) / (size - 1);
  var result = new Float32Array(size);

  for (var i = 0; i < size; i++) {
    result[i] = data[Math.round(i * factor)];
  }

  return result;
}

function resample1(data, size) {
  var factor = (data.length - 1) / (size - 1);
  var result = new Float32Array(size);
  var len = data.length - 1;

  for (var i = 0; i < size; i++) {
    var x  = i * factor;
    var x0 = x|0;
    var x1 = Math.min(x0 + 1, len);
    result[i] = data[x0] + Math.abs(x - x0) * (data[x1] - data[x0]);
  }

  return result;
}

module.exports = NeuBuffer;

},{"./fft":6,"./utils":37}],3:[function(require,module,exports){
"use strict";

var _ = require("./utils");

var INIT  = 0;
var START = 1;
var BUFFER_SIZE = 1024;
var MAX_RENDERING_SEC = 180;

var schedId = 1;

function NeuContext(context, duration) {
  this.$context = _.findAudioContext(context);

  Object.defineProperties(this, {
    sampleRate: {
      value: this.$context.sampleRate,
      enumerable: true
    },
    currentTime: {
      get: function() {
        return this._currentTime || this.$context.currentTime;
      },
      enumarable: true
    },
    destination: {
      value: this.$context.destination,
      enumerable: true
    },
    listener: {
      value: this.$context.listener,
      enumerable: true
    }
  });

  this._duration = duration;
  this.reset();
}

_.each([
  "createBuffer",
  "createBufferSource",
  "createMediaElementSource",
  "createMediaStreamSource",
  "createMediaStreamDestination",
  "createScriptProcessor",
  "createAnalyser",
  "createGain",
  "createDelay",
  "createBiquadFilter",
  "createWaveShaper",
  "createPanner",
  "createConvolver",
  "createChannelSplitter",
  "createChannelMerger",
  "createDynamicsCompressor",
  "createOscillator",
  "createPeriodicWave"
], function(methodName) {
  NeuContext.prototype[methodName] = function() {
    return this.$context[methodName].apply(this.$context, arguments);
  };
});

NeuContext.prototype.getMasterGain = function() {
  return this._masterGain;
};

NeuContext.prototype.getAnalyser = function() {
  return this._analyser;
};

NeuContext.prototype.reset = function() {
  if (this.$outlet) {
    this.$outlet.disconnect();
  }

  this._masterGain = this.$context.createGain();
  this._analyser   = this.$context.createAnalyser();

  _.connect({ from: this._masterGain, to: this._analyser });
  _.connect({ from: this._analyser  , to: this.$context.destination });

  this.$outlet = this._masterGain;

  if (this._scriptProcessor) {
    this._scriptProcessor.disconnect();
  }
  this._events = [];
  this._nextTicks = [];
  this._state = INIT;
  this._currentTime = 0;
  this._scriptProcessor = null;

  return this;
};

NeuContext.prototype.start = function() {
  if (this._state === INIT) {
    this._state = START;
    if (this.$context instanceof window.OfflineAudioContext) {
      startRendering.call(this);
    } else {
      startAudioTimer.call(this);
    }
  }
  return this;
};

function startRendering() {
  this._currentTimeIncr = Math.max(0, Math.min(_.finite(this._duration), MAX_RENDERING_SEC));
  onaudioprocess.call(this, { playbackTime: 0 });
}

function startAudioTimer() {
  var context = this.$context;
  var scriptProcessor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
  var bufferSource    = context.createBufferSource();

  this._currentTimeIncr = BUFFER_SIZE / context.sampleRate;
  this._scriptProcessor = scriptProcessor;
  scriptProcessor.onaudioprocess = onaudioprocess.bind(this);

  // this is needed for iOS Safari
  bufferSource.start(0);
  _.connect({ from: bufferSource, to: scriptProcessor });

  _.connect({ from: scriptProcessor, to: context.destination });
}

NeuContext.prototype.stop = function() {
  return this;
};

NeuContext.prototype.sched = function(time, callback, ctx) {
  time = _.finite(time);

  if (!_.isFunction(callback)) {
    return 0;
  }

  var events = this._events;
  var event  = {
    id      : schedId++,
    time    : time,
    callback: callback,
    context : ctx || this
  };

  if (events.length === 0 || _.last(events).time <= time) {
    events.push(event);
  } else {
    for (var i = 0, imax = events.length; i < imax; i++) {
      if (time < events[i].time) {
        events.splice(i, 0, event);
        break;
      }
    }
  }

  return event.id;
};

NeuContext.prototype.unsched = function(id) {
  id = _.finite(id);

  if (id !== 0) {
    var events = this._events;
    for (var i = 0, imax = events.length; i < imax; i++) {
      if (id === events[i].id) {
        events.splice(i, 1);
        break;
      }
    }
  }

  return id;
};

NeuContext.prototype.nextTick = function(callback, ctx) {
  this._nextTicks.push(callback.bind(ctx || this));
  return this;
};

function onaudioprocess(e) {
  // Safari 7.0.6 does not support e.playbackTime
  var currentTime     = e.playbackTime || /* istanbul ignore next */ this.$context.currentTime;
  var nextCurrentTime = currentTime + this._currentTimeIncr;
  var events = this._events;

  this._currentTime = currentTime;

  this._nextTicks.splice(0).forEach(function(callback) {
    callback(currentTime);
  });

  while (events.length && events[0].time <= nextCurrentTime) {
    var event = events.shift();

    this._currentTime = Math.max(this._currentTime, event.time);

    event.callback.call(event.context, event.time);
  }
}

module.exports = NeuContext;

},{"./utils":37}],4:[function(require,module,exports){
"use strict";

var _ = require("./utils");

var BUFLENGTH = 128;
var filled0 = _.fill(new Float32Array(BUFLENGTH), 0);
var filled1 = _.fill(new Float32Array(BUFLENGTH), 1);

/**
 * Create a constant amplitude signal
 *
 * @param {AudioContext} context
 * @param {number}       value
 */
function NeuDC(context, value) {
  value = _.num(value);

  var buf = context.createBuffer(1, BUFLENGTH, context.sampleRate);
  var bufSrc = context.createBufferSource();

  buf.getChannelData(0).set(
    value === 0 ? filled0 :
    value === 1 ? filled1 :
    _.fill(new Float32Array(BUFLENGTH), value)
  );

  bufSrc.buffer = buf;
  bufSrc.loop   = true;
  bufSrc.start(0);

  this._bufSrc = bufSrc;
  this.$context = this._bufSrc.context;
  this.$outlet  = this._bufSrc;
}

/**
 * @return {number} value
 */
NeuDC.prototype.valueOf = function() {
  return this._bufSrc.buffer.getChannelData(0)[0];
};

module.exports = NeuDC;

},{"./utils":37}],5:[function(require,module,exports){
"use strict";

function Emitter() {
  this._callbacks = {};
}

Emitter.prototype.hasListeners = function(event) {
  return this._callbacks.hasOwnProperty(event);
};

Emitter.prototype.listeners = function(event) {
  return this.hasListeners(event) ? this._callbacks[event].slice() : [];
};

Emitter.prototype.on = function(event, listener) {

  if (!this.hasListeners(event)) {
    this._callbacks[event] = [];
  }

  this._callbacks[event].push(listener);

  return this;
};

Emitter.prototype.once = function(event, listener) {

  function fn(payload) {
    this.off(event, fn);
    listener.call(this, payload);
  }

  fn.listener = listener;

  this.on(event, fn);

  return this;
};

Emitter.prototype.off = function(event, listener) {

  if (typeof listener === "undefined") {
    if (typeof event === "undefined") {
      this._callbacks = {};
    } else if (this.hasListeners(event)) {
      delete this._callbacks[event];
    }
  } else if (this.hasListeners(event)) {
    this._callbacks[event] = this._callbacks[event].filter(function(fn) {
      return !(fn === listener || fn.listener === listener);
    });
  }

  return this;
};

Emitter.prototype.emit = function(event, payload, ctx) {
  this.listeners(event).forEach(function(fn) {
    fn.call(this, payload);
  }, ctx || this);
};

module.exports = Emitter;

},{}],6:[function(require,module,exports){
"use strict";

var _ = require("./utils");

function forward(_buffer) {
  var n = 1 << Math.ceil(Math.log(_.finite(_buffer.length)) * Math.LOG2E);
  var buffer = new Float32Array(n);
  var real   = new Float32Array(n);
  var imag   = new Float32Array(n);
  var params = getParams(n);
  var bitrev = params.bitrev;
  var sintable = params.sintable;
  var costable = params.costable;
  var i, j, k, k2, h, d, c, s, ik, dx, dy;

  for (i = 0; i < n; i++) {
    buffer[i] = _buffer[i];
    real[i]   = _buffer[bitrev[i]];
    imag[i]   = 0.0;
  }

  for (k = 1; k < n; k = k2) {
    h = 0;
    k2 = k + k;
    d = n / k2;
    for (j = 0; j < k; j++) {
      c = costable[h];
      s = sintable[h];
      for (i = j; i < n; i += k2) {
        ik = i + k;
        dx = s * imag[ik] + c * real[ik];
        dy = c * imag[ik] - s * real[ik];
        real[ik] = real[i] - dx;
        imag[ik] = imag[i] - dy;
        real[i] += dx;
        imag[i] += dy;
      }
      h += d;
    }
  }

  return { real: real, imag: imag };
}

function inverse(_real, _imag) {
  var n = 1 << Math.ceil(Math.log(_.finite(_real.length)) * Math.LOG2E);
  var buffer = new Float32Array(n);
  var real   = new Float32Array(n);
  var imag   = new Float32Array(n);
  var params = getParams(n);
  var bitrev = params.bitrev;
  var sintable = params.sintable;
  var costable = params.costable;
  var i, j, k, k2, h, d, c, s, ik, dx, dy;

  for (i = 0; i < n; i++) {
    j = bitrev[i];
    real[i] = +_real[j];
    imag[i] = -_imag[j];
  }

  for (k = 1; k < n; k = k2) {
    h = 0;
    k2 = k + k;
    d = n / k2;
    for (j = 0; j < k; j++) {
      c = costable[h];
      s = sintable[h];
      for (i = j; i < n; i += k2) {
        ik = i + k;
        dx = s * imag[ik] + c * real[ik];
        dy = c * imag[ik] - s * real[ik];
        real[ik] = real[i] - dx;
        imag[ik] = imag[i] - dy;
        real[i] += dx;
        imag[i] += dy;
      }
      h += d;
    }
  }

  for (i = 0; i < n; i++) {
    buffer[i] = real[i] / n;
  }

  return buffer;
}

function calcBitRev(n) {
  var x = new Int16Array(n);

  var n2 = n >> 1;
  var i = 0;
  var j = 0;

  while (true) {
    x[i] = j;

    if (++i >= n) {
      break;
    }

    var k = n2;

    while (k <= j) {
      j -= k;
      k >>= 1;
    }

    j += k;
  }

  return x;
}

function getParams(n) {
  if (getParams.cache[n]) {
    return getParams.cache[n];
  }

  var bitrev = calcBitRev(n);
  var k = Math.floor(Math.log(n) / Math.LN2);
  var sintable = new Float32Array((1 << k) - 1);
  var costable = new Float32Array((1 << k) - 1);

  for (var i = 0, imax = sintable.length; i < imax; i++) {
    sintable[i] = Math.sin(Math.PI * 2 * (i / n));
    costable[i] = Math.cos(Math.PI * 2 * (i / n));
  }

  getParams.cache[n] = {
    bitrev  : bitrev,
    sintable: sintable,
    costable: costable,
  };

  return getParams.cache[n];
}
getParams.cache = [];

module.exports = {
  forward: forward,
  inverse: inverse,
};

},{"./utils":37}],7:[function(require,module,exports){
"use strict";

var _ = require("./utils");

_.NeuUGen = require("./ugen");

function NeuIn(synth) {
  this.$synth   = synth;
  this.$context = synth.$context;
  this.$outlet  = this.$context.createGain();
}
_.inherits(NeuIn, _.NeuUGen);

module.exports = NeuIn;

},{"./ugen":16,"./utils":37}],8:[function(require,module,exports){
"use strict";

var _ = require("./utils");

var INIT  = 0;
var START = 1;
var STOP  = 2;

function NeuInterval(context, interval, callback) {
  interval = _.finite(interval);

  this.$context = context;

  this._interval = Math.max(1 / context.sampleRate, interval);
  this._callback = callback;
  this._oninterval = oninterval.bind(this);
  this._state = INIT;
  this._stateString = "init";
  this._startTime = 0;
  this._stopTime = Infinity;
  this._count = 0;

  Object.defineProperties(this, {
    context: {
      value: _.findAudioContext(this.$context),
      enumerable: true
    },
    outlet: {
      value: null,
      enumerable: true
    },
    state: {
      get: function() {
        return this._stateString;
      },
      enumerable: true
    },
  });
}

NeuInterval.prototype.start = function(t) {
  t = _.defaults(t, this.$context.currentTime);

  if (this._state === INIT) {
    this._state = START;
    this._stateString = "ready";
    this._startTime = t;

    if (_.isFunction(this._callback)) {
      this.$context.sched(this._startTime, function(t) {
        this._stateString = "start";
        this._oninterval(t);
      }, this);
    }

    this.$context.start(); // auto start(?)
  }

  return this;
};

NeuInterval.prototype.stop = function(t) {
  t = _.defaults(t, this.$context.currentTime);

  if (this._state === START) {
    this._state = STOP;
    this._stopTime = t;
    this.$context.sched(this._stopTime, function() {
      this._stateString = "stop";
    }, this);
  }

  return this;
};

function oninterval(t) {
  if (t < this._stopTime) {
    this._callback({ playbackTime: t, count: this._count++ });

    var nextTime = this._startTime + this._interval * this._count;
    this.$context.sched(nextTime, this._oninterval);
  }
}

module.exports = NeuInterval;

},{"./utils":37}],9:[function(require,module,exports){
"use strict";

// Safari 7.0.6  needs webkit prefix
window.AudioContext = window.AudioContext || /* istanbul ignore next */ window.webkitAudioContext;
window.OfflineAudioContext = window.OfflineAudioContext || /* istanbul ignore next */ window.webkitOfflineAudioContext;

var _ = require("./utils");

var neume = function(context) {
  function Neume(spec) {
    return neume.build(context, spec);
  }

  var audioContext = _.findAudioContext(context);

  Object.defineProperties(Neume, {
    context: {
      value: audioContext,
      enumerable: true
    },
    outlet: {
      value: _.findAudioNode(context),
      enumerable: true
    },
    sampleRate: {
      value: audioContext.sampleRate,
      enumerable: true
    },
    currentTime: {
      get: function() {
        return context.currentTime;
      },
      enumerable: true
    },
    Buffer: {
      value: Object.defineProperties({}, {
        create: {
          value: function(channels, length, sampleRate) {
            return neume.Buffer.create(context, channels, length, sampleRate);
          },
          enumerable: true
        },
        fill: {
          value: function(length, func) {
            return neume.Buffer.fill(context, length, func);
          },
          enumerable: true
        },
        from: {
          value: function(data) {
            return neume.Buffer.from(context, data);
          },
          enumerable: true
        },
        load: {
          value: function(url) {
            return neume.Buffer.load(context, url);
          },
          enumerable: true
        }
      }),
      enumerable: true
    },
    Interval: {
      value: function(interval, callback) {
        return new neume.Interval(context, interval, callback);
      },
      enumerable: true
    },
  });

  return Neume;
};

neume._ = _;
neume.Context  = require("./context");
neume.SynthDef = require("./synthdef");
neume.Synth    = require("./synth");
neume.UGen     = require("./ugen");
neume.Param    = require("./param");
neume.Unit     = require("./unit");
neume.DC       = require("./dc");
neume.Buffer   = require("./buffer");
neume.Interval = require("./interval");

neume.build = function(context, spec) {
  return new neume.SynthDef(context, spec);
};

neume.register = function(name, func) {
  neume.UGen.register(name, func);
  return neume;
};

neume.use = function(fn) {
  /* istanbul ignore else */
  if (neume.use.used.indexOf(fn) === -1) {
    fn(neume, _);
    neume.use.used.push(fn);
  }
  return neume;
};
neume.use.used = [];

neume.render = function(context, duration, func) {
  var sampleRate = context.sampleRate;
  var length     = _.int(sampleRate * duration);

  return new Promise(function(resolve) {
    var audioContext = new window.OfflineAudioContext(2, length, sampleRate);
    audioContext.oncomplete = function(e) {
      resolve(new neume.Buffer(context, e.renderedBuffer));
    };
    func(neume(new neume.Context(audioContext, duration)));
    audioContext.startRendering();
  });
};

var context = new neume.Context(new window.AudioContext());

neume.Neume = Object.defineProperties(
  neume(context), {
    render: {
      value: function(duration, func) {
        return neume.render(context, duration, func);
      },
      enumerable: true
    },
    use: {
      value: neume.use,
      enumerable: true
    },
    master: {
      value: context.getMasterGain(),
      enumerable: true
    },
    analyer: {
      value: context.getAnalyser(),
      enumerable: true
    }
  }
);

module.exports = neume;

},{"./buffer":2,"./context":3,"./dc":4,"./interval":8,"./param":10,"./synth":12,"./synthdef":14,"./ugen":16,"./unit":36,"./utils":37}],10:[function(require,module,exports){
"use strict";

var _ = require("./utils");

_.NeuUGen = require("./ugen");
_.NeuDC   = require("./dc");

function NeuParam(synth, name, value) {
  this.name = name;

  this.$synth   = synth;
  this.$context = synth.$context;
  this.$outlet  = null;

  this._params = [];
  this._connected = [];
  this._value = _.finite(value);
}
_.inherits(NeuParam, _.NeuUGen);

NeuParam.prototype._connect = function(to) {
  // FIXME: test!!!
  if (this._connected.indexOf(to) === -1) {
    this._connected.push(to);
    if (_.isAudioParam(to)) {
      this._params.push(to);
      to.setValueAtTime(this._value, 0);
    } else {
      if (this.$outlet == null) {
        this.$outlet = this.$context.createGain();
        _.connect({ from: new _.NeuDC(this.$context, 1), to: this.$outlet });
        this._params.push(this.$outlet.gain);
        this.$outlet.gain.setValueAtTime(this._value, 0);
      }
      _.connect({ from: this.$outlet, to: to });
    }
  }
};

NeuParam.prototype.valueOf = function() {
  return this._params.length ? this._params[0].value : /* istanbul ignore next */ 0;
};

NeuParam.prototype.set = function(value) {
  value = _.finite(value);

  var startTime = this.$context.currentTime;

  this._params.forEach(function(param) {
    param.setValueAtTime(value, startTime);
  });

  return this;
};

NeuParam.prototype.setAt = function(value, startTime) {
  value     = _.finite(value);
  startTime = _.finite(startTime);

  this._params.forEach(function(param) {
    param.setValueAtTime(value, startTime);
  });

  return this;
};

NeuParam.prototype.linTo = function(value, endTime) {
  value   = _.finite(value);
  endTime = _.finite(endTime);

  this._params.forEach(function(param) {
    param.linearRampToValueAtTime(value, endTime);
  });

  return this;
};

NeuParam.prototype.expTo = function(value, endTime) {
  value   = _.finite(value);
  endTime = _.finite(endTime);

  this._params.forEach(function(param) {
    param.exponentialRampToValueAtTime(value, endTime);
  });

  return this;
};

NeuParam.prototype.targetAt = function(target, startTime, timeConstant) {
  target       = _.finite(target);
  startTime    = _.finite(startTime);
  timeConstant = _.finite(timeConstant);

  this._params.forEach(function(param) {
    param.setTargetAtTime(target, startTime, timeConstant);
  });

  return this;
};

NeuParam.prototype.curveAt = function(values, startTime, duration) {
  startTime = _.finite(startTime);
  duration  = _.finite(duration);

  this._params.forEach(function(param) {
    param.setValueCurveAtTime(values, startTime, duration);
  });

  return this;
};

NeuParam.prototype.cancel = function(startTime) {
  startTime = _.finite(startTime);

  this._params.forEach(function(param) {
    param.cancelScheduledValues(startTime);
  });

  return this;
};

module.exports = NeuParam;

},{"./dc":4,"./ugen":16,"./utils":37}],11:[function(require,module,exports){
"use strict";

var reUGenName = /^([a-zA-Z](-?[a-zA-Z0-9]+)*!?\??|[-+*\/%<=>!?&|@]+)/;

function isValidUGenName(name) {
  var exec = reUGenName.exec(name);
  return !!exec && exec[0] === name;
}

function parse(selector) {
  selector = String(selector);

  var parsed = { key: "", id: null, class: [] };

  var keyMatched = selector.match(reUGenName);
  if (keyMatched) {
    parsed.key = keyMatched[0];
    selector = selector.substr(parsed.key.length);
  }

  var matched = selector.match(/[.#][a-zA-Z](-?[a-zA-Z0-9]+)*/g);
  if (matched) {
    matched.forEach(function(match) {
      var ch0 = match.charAt(0);
      if (ch0 === "#") {
        if (!parsed.id) {
          parsed.id = match.substr(1);
        }
      } else {
        parsed.class.push(match.substr(1));
      }
    });
  }

  return parsed;
}

module.exports = {
  isValidUGenName: isValidUGenName,
  parse: parse
};

},{}],12:[function(require,module,exports){
"use strict";

var _ = require("./utils");

_.NeuUGen    = require("./ugen");
_.NeuParam   = require("./param");
_.NeuIn      = require("./in");
_.NeuSynthDB = require("./synthdb");

var EMPTY_DB = new _.NeuSynthDB();
var INIT  = 0;
var START = 1;
var STOP  = 2;

function NeuSynth(context, func, args) {
  var _this = this;

  this.$context = context;

  var db = new _.NeuSynthDB();

  function $() {
    var args = _.toArray(arguments);
    var key  = args.shift();
    var spec = _.isDictionary(_.first(args)) ? args.shift() : {};
    var inputs = args.reduce(function(a, b) {
      return a.concat(b);
    }, []);
    var ugen = _.NeuUGen.build(_this, key, spec, inputs);

    db.append(ugen);

    return ugen;
  }

  var params  = {};
  var inputs  = [];
  var outputs = [];
  var methods = {};
  var timers  = [];

  $.param = function(name, defaultValue) {
    if (_.has(params, name)) {
      return params[name];
    }

    defaultValue = _.finite(_.defaults(defaultValue, 0));

    validateParam(name, defaultValue);

    var param = new _.NeuParam(_this, name, defaultValue);

    Object.defineProperty(_this, name, {
      set: function(value) {
        param.set(value);
      },
      get: function() {
        return param;
      }
    });

    params[name] = param;

    return param;
  };

  $.in = function(index) {
    index = Math.max(0, _.int(index));

    if (!inputs[index]) {
      inputs[index] = new _.NeuIn(_this);
    }

    return inputs[index];
  };

  $.out = function(index, ugen) {
    index = Math.max(0, _.int(index));

    if (ugen instanceof _.NeuUGen) {
      outputs[index] = ugen;
    }

    return null;
  };

  $.method = function(methodName, func) {
    if (/^[a-z]\w*$/.test(methodName) && _.isFunction(func)) {
      methods[methodName] = func;
    }
  };

  $.timeout = function(timeout) {
    timeout = Math.max(0, _.finite(timeout));

    var schedId   = 0;
    var callbacks = _.toArray(arguments).slice(1).filter(_.isFunction);

    function sched(t) {
      schedId = context.sched(t, function(t) {
        schedId = 0;
        callbacks.forEach(function(func) {
          func.call(_this, t, 1);
        });
      });
    }

    timers.push({
      start: function(t) {
        sched(t + timeout);
      },
      stop: function() {
        context.unsched(schedId);
        schedId = 0;
      }
    });
  };

  $.interval = function(interval) {
    interval = Math.max(1 / context.sampleRate, _.finite(interval));

    var schedId   = 0;
    var callbacks = _.toArray(arguments).slice(1).filter(_.isFunction);
    var startTime = 0;
    var count     = 0;

    function sched(t) {
      schedId = context.sched(t, function(t) {
        schedId = 0;
        count  += 1;
        callbacks.forEach(function(func) {
          func.call(_this, t, count);
        });
        sched(startTime + interval * (count + 1));
      });
    }

    timers.push({
      start: function(t) {
        startTime = t;
        sched(t + interval);
      },
      stop: function() {
        context.unsched(schedId);
        schedId = 0;
      }
    });
  };

  var result = _.findAudioNode(func.apply(null, [ $ ].concat(args)));

  if (outputs[0] == null && _.isAudioNode(result)) {
    outputs[0] = result;
  }

  this.$inputs  = inputs;
  this.$outputs = outputs;
  this._routing = [];
  this._db = outputs.length ? db : EMPTY_DB;
  this._state = INIT;
  this._stateString = "init";
  this._timers = timers;
  this._methodNames = [];

  Object.defineProperties(this, {
    context: {
      value: _.findAudioContext(this.$context),
      enumerable: true
    },
    currentTime: {
      get: function() {
        return this.$context.currentTime;
      },
      enumerable: true
    },
    outlet: {
      value: _.findAudioNode(this.$outputs[0]),
      enumerable: true
    },
    state: {
      get: function() {
        return this._stateString;
      },
      enumerable: true
    },
  });

  _.each(methods, function(method, methodName) {
    this._methodNames.push(methodName);
    Object.defineProperty(this, methodName, {
      value: function() {
        method.apply(this, _.toArray(arguments));
      }
    });
  }, this);

  this._db.all().forEach(function(ugen) {
    _.keys(ugen.$unit.$methods).forEach(function(methodName) {
      if (!this.hasOwnProperty(methodName)) {
        this._methodNames.push(methodName);
        Object.defineProperty(this, methodName, {
          value: function() {
            return this.apply(methodName, _.toArray(arguments));
          }
        });
      }
    }, this);
  }, this);

  this._methodNames = this._methodNames.sort();
}

NeuSynth.prototype.getMethods = function() {
  return this._methodNames.slice();
};

NeuSynth.prototype.start = function(t) {
  t = _.defaults(t, this.$context.currentTime);

  if (this._state === INIT) {
    this._state = START;
    this._stateString = "ready";

    this.$context.sched(t, function(t) {
      this._stateString = "start";

      if (this._routing.length === 0) {
        _.connect({ from: this.$outputs[0], to: this.$context.$outlet });
      } else {
        this._routing.forEach(function(destinations, output) {
          destinations.forEach(function(destination) {
            _.connect({ from: this.$outputs[output], to: destination });
          }, this);
        }, this);
      }

      this._db.all().forEach(function(ugen) {
        ugen.$unit.start(t);
      });

      this._timers.forEach(function(timer) {
        timer.start(t);
      });
    }, this);

    this.$context.start(); // auto start(?)
  }

  return this;
};

NeuSynth.prototype.stop = function(t) {
  t = _.defaults(t, this.$context.currentTime);

  if (this._state === START) {
    this._state = STOP;

    this.$context.sched(t, function(t) {
      this._stateString = "stop";

      this.$context.nextTick(function() {
        this.$outputs.forEach(function(output) {
          _.disconnect({ from: output });
        });
      }, this);

      this._db.all().forEach(function(ugen) {
        ugen.$unit.stop(t);
      });

      this._timers.forEach(function(timer) {
        timer.stop(t);
      });
    }, this);
  }

  return this;
};

NeuSynth.prototype.apply = function(method, args) {
  iterateOverTargetss(this._db, method, function(ugen, method) {
    ugen.$unit.apply(method, args);
  });
  return this;
};

NeuSynth.prototype.call = function() {
  var args = _.toArray(arguments);
  var method = args.shift();

  return this.apply(method, args);
};

NeuSynth.prototype.connect = function(destination, output, input) {
  output = Math.max(0, _.int(output));
  input  = Math.max(0, _.int(input));

  if (destination instanceof NeuSynth && this.$outputs[output] && destination.$inputs[input]) {
    if (!this._routing[output]) {
      this._routing[output] = [];
    }
    this._routing[output].push(_.findAudioNode(destination.$inputs[input]));
  }

  return this;
};

NeuSynth.prototype.hasListeners = function(event) {
  var result = false;

  iterateOverTargetss(this._db, event, function(ugen, event) {
    result = result || ugen.hasListeners(event);
  });

  return result;
};

NeuSynth.prototype.listeners = function(event) {
  var listeners = [];

  iterateOverTargetss(this._db, event, function(ugen, event) {
    ugen.listeners(event).forEach(function(listener) {
      if (listeners.indexOf(listener) === -1) {
        listeners.push(listener);
      }
    });
  });

  return listeners;
};

NeuSynth.prototype.on = function(event, listener) {
  iterateOverTargetss(this._db, event, function(ugen, event) {
    ugen.on(event, listener);
  });
  return this;
};

NeuSynth.prototype.once = function(event, listener) {
  iterateOverTargetss(this._db, event, function(ugen, event) {
    ugen.once(event, listener);
  });
  return this;
};

NeuSynth.prototype.off = function(event, listener) {
  iterateOverTargetss(this._db, event, function(ugen, event) {
    ugen.off(event, listener);
  });
  return this;
};

function iterateOverTargetss(db, event, callback) {
  var parsed = parseEvent(event);

  if (parsed) {
    var targets = parsed.selector ? db.find(parsed.selector) : db.all();
    targets.forEach(function(ugen) {
      callback(ugen, parsed.name);
    });
  }
}

function parseEvent(event) {
  var matched = /^(?:(.*?):([a-z]\w+)|([a-z]\w+))$/.exec(event);

  if (!matched) {
    return null;
  }

  if (matched[3] != null) {
    return { selector: null, name: matched[3]};
  }

  return { selector: matched[1], name: matched[2] };
}

function validateParam(name) {
  if (!/^[a-z]\w*$/.test(name)) {
    throw new TypeError(_.format(
      "invalid parameter name: #{name}", {
        name: name
      }
    ));
  }
}

module.exports = NeuSynth;

},{"./in":7,"./param":10,"./synthdb":13,"./ugen":16,"./utils":37}],13:[function(require,module,exports){
"use strict";

var _ = require("./utils");
var selectorParser = require("./selector-parser");

function NeuSynthDB() {
  this._all = [];
  this._ids = {};
}

NeuSynthDB.prototype.append = function(obj) {
  if (_.isObject(obj)) {
    this._all.push(obj);
    if (_.has(obj, "$id")) {
      this._ids[obj.$id] = obj;
    }
  }
  return this;
};

NeuSynthDB.prototype.all = function() {
  return this._all;
};

NeuSynthDB.prototype.find = function(selector) {
  var result = null;
  var parsed = selectorParser.parse(selector);

  if (parsed.id) {
    result = this._ids[parsed.id] ? [ this._ids[parsed.id] ] : [];
  } else {
    result = this._all;
  }

  parsed.class.forEach(function(cls) {
    result = result.filter(function(obj) {
      return obj.$class.indexOf(cls) !== -1;
    });
  });

  if (parsed.key) {
    result = result.filter(function(obj) {
      return obj.$key === parsed.key;
    });
  }

  return result;
};

module.exports = NeuSynthDB;

},{"./selector-parser":11,"./utils":37}],14:[function(require,module,exports){
"use strict";

var _ = require("./utils");

_.NeuSynth = require("./synth");

function NeuSynthDef(defaultContext, func) {
  if (!_.isFunction(func)) {
    throw new TypeError("NeuSynthDef func is not a function");
  }

  function SynthDef() {
    var context = defaultContext;
    var args = _.toArray(arguments);

    if (_.isAudioContext(_.first(args))) {
      context = _.first(args);
      args = _.rest(args);
    }

    return new _.NeuSynth(context, func, args);
  }

  Object.defineProperties(SynthDef, {
    context: {
      value: _.findAudioContext(defaultContext),
      enumerable: true
    }
  });

  return SynthDef;
}

module.exports = NeuSynthDef;

},{"./synth":12,"./utils":37}],15:[function(require,module,exports){
"use strict";

var _ = require("./utils");

_.NeuDC = require("./dc");

/**
 * Apply mul, add
 *
 * @param {AudioContext} context
 * @param {NeuUGen}      ugen
 * @param {object}       spec
 * @return {AudioNode}   applied mul, add
 */
function makeOutlet(context, ugen, spec) {
  var outlet;

  var mul = spec.mul;
  var add = spec.add;
  var node = _.findAudioNode(ugen);

  if (!_.isAudioNode(node)) {
    return null;
  }

  if (mul === 0) {
    if (_.isValidInput(add)) {
      if (_.isNumber(add)) {
        add = _.findAudioNode(new _.NeuDC(context, add));
      }
      return add;
    }
    return _.findAudioNode(new _.NeuDC(context, 0));
  }

  if (_.isValidInput(mul) && mul !== 0 && mul !== 1) {
    /*
     * +------+
     * | node |
     * +------+
     *   |
     * +--------------+
     * | GainNode     |
     * | - gain: mul  |
     * +--------------+
     *   |
     */
    if (node.$maddOptimizable && node.gain.value === 1) {
      outlet = node;
      node.$maddOptimizable = false;
    } else {
      outlet = context.createGain();
      _.connect({ from: node, to: outlet });
    }

    outlet.gain.value = 0;
    _.connect({ from: mul , to: outlet.gain });

    node = outlet;
  }

  if (_.isValidInput(add) && add !== 0) {
    /*
     * +------+  +-----+
     * | node |  | add |
     * +------+  +-----+
     *   |         |
     * +---------------+
     * | GainNode      |
     * | - gain: 1     |
     * +---------------+
     *   |
     */
    outlet = context.createGain();

    if (_.isNumber(add)) {
      add = new _.NeuDC(context, add);
    }

    _.connect({ from: node, to: outlet });
    _.connect({ from: add , to: outlet });

    node = outlet;
  }

  return node;
}

module.exports = makeOutlet;

},{"./dc":4,"./utils":37}],16:[function(require,module,exports){
"use strict";

var _ = require("./utils");
var Emitter = require("./emitter");
var NeuUnit = require("./unit");
var makeOutlet = require("./ugen-makeOutlet");
var selectorParser = require("./selector-parser");

function NeuUGen(synth, key, spec, inputs) {
  Emitter.call(this);

  var parsed = selectorParser.parse(key);

  this.$synth   = synth;
  this.$context = synth.$context;
  this.$key   = parsed.key;
  this.$class = parsed.class;
  this.$id    = parsed.id;

  if (!NeuUGen.registered.hasOwnProperty(parsed.key)) {
    throw new Error("unknown key: " + key);
  }

  var unit = NeuUGen.registered[parsed.key](this, spec, inputs);

  if (!(unit instanceof NeuUnit)) {
    throw new Error("invalid key: " + key);
  }

  this.$unit   = unit;
  this.$outlet = makeOutlet(this.$context, unit, spec);

  Object.defineProperties(this, {
    context: {
      value: _.findAudioContext(this.$context),
      enumerable: true
    },
    outlet: {
      value: _.findAudioNode(this.$outlet),
      enumerable: true
    },
  });

  _.each(unit.$methods, function(method, name) {
    _.definePropertyIfNotExists(this, name, {
      value: method
    });
  }, this);
}
_.inherits(NeuUGen, Emitter);

NeuUGen.registered = {};

NeuUGen.register = function(name, func) {
  if (!selectorParser.isValidUGenName(name)) {
    throw new Error("invalid ugen name: " + name);
  }
  if (!_.isFunction(func)) {
    throw new TypeError("ugen must be a function");
  }
  NeuUGen.registered[name] = func;
};

NeuUGen.build = function(synth, key, spec, inputs) {
  if (!_.isString(key)) {
    spec.value = key;
    key = _.typeOf(key);
  }

  return new NeuUGen(synth, key, spec, inputs);
};

NeuUGen.prototype.add = function(node) {
  return new NeuUGen(this.$synth, "+", {}, [ this, _.defaults(node, 0) ]);
};

NeuUGen.prototype.mul = function(node) {
  return new NeuUGen(this.$synth, "*", {}, [ this, _.defaults(node, 1) ]);
};

NeuUGen.prototype.madd = function(mul, add) {
  return this.mul(_.defaults(mul, 1)).add(_.defaults(add, 0));
};

module.exports = NeuUGen;

},{"./emitter":5,"./selector-parser":11,"./ugen-makeOutlet":15,"./unit":36,"./utils":37}],17:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /**
   * +------------+
   * | ...inputs  |
   * +------------+
   *   |
   * +------------+
   * | GainNode   |
   * | - gain: 1  |
   * +------------+
   *   |
   */
  neume.register("+", function(ugen, spec, inputs) {
    var parts = _.partition(inputs, _.isNumber);
    var nodes = _.second(parts);
    var offset = _.reduce(_.first(parts), function(a, b) {
      return a + b;
    }, 0);

    if (offset !== 0) {
      nodes.push(new neume.DC(ugen.$context, offset));
    }

    var outlet = ugen.$context.createGain();

    nodes.forEach(function(node) {
      _.connect({ from: node, to: outlet });
    });

    outlet.$maddOptimizable = true;

    return new neume.Unit({
      outlet: outlet
    });
  });

};

},{}],18:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /**
   * $([], {}
   *   mode : enum[ clip, wrap, fold ] = wrap
   *   lag  : number = 0
   *   curve: number = 0
   * } ... inputs)
   *
   * methods:
   *   setValue(t, value)
   *   at(t, index)
   *   next(t)
   *   prev(t)
   *
   * +--------+      +-------+
   * | inputs |  or  | DC(1) |
   * +--------+      +-------+
   *   ||||||
   * +----------------------+
   * | GainNode             |
   * | - gain: array[index] |
   * +----------------------+
   *   |
   */
  neume.register("array", function(ugen, spec, inputs) {
    var context = ugen.$context;

    var gain  = context.createGain();
    var index = 0;
    var data  = spec.value;
    var mode  = {
      clip: _.clipAt,
      fold: _.foldAt,
    }[spec.mode] || /* istanbul ignore next*/ _.wrapAt;
    var lag   = _.finite(spec.lag);
    var curve = _.finite(spec.lag);

    if (!_.isArray(data) || data.length === 0)  {
      data = [ 0 ];
    }

    if (_.isEmpty(inputs)) {
      inputs = [ new neume.DC(context, 1) ];
    }

    inputs.forEach(function(node) {
      _.connect({ from: node, to: gain });
    });

    var prevValue = _.finite(data[0]);

    gain.gain.setValueAtTime(prevValue, 0);

    function update(t0, nextIndex) {
      var v0 = prevValue;
      var v1 = _.finite(mode(data, nextIndex));

      if (lag <= 0 || curve < 0 || 1 <= curve) {
        gain.gain.setValueAtTime(v1, t0);
      } else {
        gain.gain.setTargetAtTime(v1, t0, timeConstant(lag, v0, v1, curve));
      }

      prevValue = v1;
      index = nextIndex;
    }

    return new neume.Unit({
      outlet: gain,
      methods: {
        setValue: function(t, value) {
          if (_.isArray(value)) {
            context.sched(t, function() {
              data = value;
            });
          }
        },
        at: function(t, index) {
          context.sched(t, function() {
            update(t, _.int(index));
          });
        },
        next: function(t) {
          context.sched(t, function() {
            update(t, index + 1);
          });
        },
        prev: function(t) {
          context.sched(t, function() {
            update(t, index - 1);
          });
        }
      }
    });
  });

  function timeConstant(duration, startValue, endValue, curve) {
    var targetValue = startValue + (endValue - startValue) * (1 - curve);

    return -duration / Math.log((targetValue - endValue) / (startValue - endValue));
  }

};

},{}],19:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /**
   * $("biquad", {
   *   type  : [string]="lowpass",
   *   freq  : [number|UGen]=350,
   *   detune: [number|UGen]=0,
   *   Q     : [number|UGen]=1,
   *   gain  : [number|UGen] = 0
   * } ... inputs)
   *
   * aliases:
   *   $("lowpass"), $("highpass"),
   *   $("lowshelf"), $("highshelf"), $("peaking"), $("notch"), $("allpass")
   *   $("lpf"), $("hpf"), $("bpf")
   *
   * +--------+
   * | inputs |
   * +--------+
   *   ||||||
   * +-------------------------+
   * | BiquadFilterNode        |
   * | - type: type            |
   * | - freqquency: freq(350) |
   * | - detune: detune(0)     |
   * | - Q: Q(1)               |
   * | - gain: gain(0)         |
   * +-------------------------+
   *  |
   */

  var FILTER_TYPES = {
    lowpass  : "lowpass",
    highpass : "highpass",
    lowshelf : "lowshelf",
    highshelf: "highshelf",
    peaking  : "peaking",
    notch    : "notch",
    allpass  : "allpass",
    lpf      : "lowpass",
    hpf      : "highpass",
    bpf      : "bandpass",
  };

  neume.register("biquad", function(ugen, spec, inputs) {
    var type = FILTER_TYPES[spec.type] || "lowpass";
    return make(setup(type, ugen, spec, inputs));
  });

  _.each(FILTER_TYPES, function(type, name) {
    neume.register(name, function(ugen, spec, inputs) {
      return make(setup(type, ugen, spec, inputs));
    });
  });

  function setup(type, ugen, spec, inputs) {
    var biquad = ugen.$context.createBiquadFilter();

    biquad.type = type;
    biquad.frequency.value = 0;
    biquad.detune.value    = 0;
    biquad.Q.value         = 0;
    biquad.gain.value      = 0;
    _.connect({ from: _.defaults(spec.freq  , 350), to: biquad.frequency });
    _.connect({ from: _.defaults(spec.detune,   0), to: biquad.detune    });
    _.connect({ from: _.defaults(spec.Q     ,   1), to: biquad.Q         });
    _.connect({ from: _.defaults(spec.gain  ,   0), to: biquad.gain      });

    _.each(inputs, function(node) {
      _.connect({ from: node, to: biquad });
    });

    return biquad;
  }

  function make(biquad) {
    return new neume.Unit({
      outlet: biquad
    });
  }

};

},{}],20:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /**
   * $(boolean, {
   *   lag  : number = 0
   *   curve: number = 0
   * } ... inputs)
   *
   * methods:
   *   setValue(t, value)
   *   toggle(t)
   *
   * +--------+      +-------+
   * | inputs |  or  | DC(1) |
   * +--------+      +-------+
   *   ||||||
   * +-----------------------+
   * | GainNode              |
   * | - gain: value ? 0 : 1 |
   * +-----------------------+
   *   |
   */
  neume.register("boolean", function(ugen, spec, inputs) {
    var context = ugen.$context;

    var gain  = context.createGain();
    var data  = !!spec.value;
    var lag   = _.finite(spec.lag);
    var curve = _.finite(spec.curve);

    if (_.isEmpty(inputs)) {
      inputs = [ new neume.DC(context, 1) ];
    }

    inputs.forEach(function(node) {
      _.connect({ from: node, to: gain });
    });

    gain.gain.setValueAtTime(data ? 1 : 0, 0);

    function update(t0, v0, v1, nextData) {
      if (lag <= 0 || curve < 0 || 1 <= curve) {
        gain.gain.setValueAtTime(v1, t0);
      } else {
        gain.gain.setTargetAtTime(v1, t0, timeConstant(lag, v0, v1, curve));
      }
      data = nextData;
    }

    return new neume.Unit({
      outlet: gain,
      methods: {
        setValue: function(t, value) {
          if (_.isBoolean(value)) {
            context.sched(t, function() {
              var v0 = data  ? 1 : 0;
              var v1 = value ? 1 : 0;
              update(t, v0, v1, value);
            });
          }
        },
        toggle: function(t) {
          context.sched(t, function() {
            var v0 = data ? 1 : 0;
            var v1 = data ? 0 : 1;
            update(t, v0, v1, !data);
          });
        }
      }
    });
  });

  function timeConstant(duration, startValue, endValue, curve) {
    var targetValue = startValue + (endValue - startValue) * (1 - curve);

    return -duration / Math.log((targetValue - endValue) / (startValue - endValue));
  }

};

},{}],21:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /**
   * $("buf", {
   *   buffer      : AudioBuffer|NeuBuffer = null,
   *   playbackRate: number|UGen = 1
   *   loop        : boolean = false
   *   loopStart   : number = 0
   *   loopEnd     : number = 0
   * })
   *
   * aliases:
   *   $(AudioBuffer), $(NeuBuffer)
   *
   * start:
   *   start BufferSourceNode
   *
   * stop:
   *   stop BufferSourceNode
   *
   * +---------------------------+
   * | BufferSourceNode          |
   * | - buffer: buffer(null)    |
   * | - playbackRate: rate(1)   |
   * | - loop: loop(false)       |
   * | - loopStart: loopStart(0) |
   * | - loopEnd: loopEnd(0)     |
   * +---------------------------+
   *   |
   */
  neume.register("buf", function(ugen, spec) {
    return make(spec.buffer, ugen, spec);
  });

  neume.register("audiobuffer", function(ugen, spec) {
    return make(spec.value, ugen, spec);
  });

  neume.register("neubuffer", function(ugen, spec) {
    return make(spec.value, ugen, spec);
  });

  function make(buffer, ugen, spec) {
    buffer = _.findAudioBuffer(buffer);

    var context = ugen.$context;
    var bufSrc  = context.createBufferSource();

    /* istanbul ignore else */
    if (buffer != null) {
      bufSrc.buffer = buffer;
    }
    bufSrc.loop = !!_.defaults(spec.loop, false);
    bufSrc.loopStart = _.finite(_.defaults(spec.loopStart, 0));
    bufSrc.loopEnd   = _.finite(_.defaults(spec.loopEnd  , 0));

    bufSrc.playbackRate.value = 0;
    _.connect({ from: _.defaults(spec.rate, 1), to: bufSrc.playbackRate });

    var offset = _.finite(_.defaults(spec.offset, 0));
    var duration = _.defaults(spec.duration, null);
    if (duration != null) {
      duration = _.finite(duration);
    }

    function start(t) {
      if (duration != null) {
        bufSrc.start(t, offset, duration);
      } else {
        bufSrc.start(t, offset);
      }
      bufSrc.onended = function() {
        ugen.emit("end", {
          playbackTime: context.currentTime
        }, ugen.$synth);
      };
    }

    function stop(t) {
      bufSrc.stop(t);
    }

    return new neume.Unit({
      outlet: bufSrc,
      start : start,
      stop  : stop
    });
  }

};

},{}],22:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /**
   * +------------+
   * | ...inputs  |
   * +------------+
   *   |
   * +-----------------------------+
   * | DynamicsCompressorNode      |
   * | - threshold: threshold(-24) |
   * | - knee: knee(30)            |
   * | - ratio: ratio(12)          |
   * | - attack: attack(0.003)     |
   * | - release: release(0.25)    |
   * +-----------------------------+
   *   |
   */
  neume.register("comp", function(ugen, spec, inputs) {
    var comp = ugen.$context.createDynamicsCompressor();

    comp.threshold.value = 0;
    comp.knee.value = 0;
    comp.ratio.value = 0;
    comp.attack.value = 0;
    comp.release.value = 0;
    _.connect({ from: _.defaults(spec.threshold,   -24), to: comp.threshold });
    _.connect({ from: _.defaults(spec.knee     ,    30), to: comp.knee });
    _.connect({ from: _.defaults(spec.ratio    ,    12), to: comp.ratio });
    _.connect({ from: _.defaults(spec.attack   , 0.003), to: comp.attack });
    _.connect({ from: _.defaults(spec.release  , 0.250), to: comp.release });

    inputs.forEach(function(node) {
      _.connect({ from: node, to: comp });
    });

    return new neume.Unit({
      outlet: comp
    });
  });

};

},{}],23:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /**
   * +------------+
   * | ...inputs  |
   * +------------+
   *   |
   * +------------------------------+
   * | ConvolverNode                |
   * | - buffer: buffer(null)       |
   * | - normalize: normalize(true) |
   * +------------------------------+
   *   |
   */
  neume.register("conv", function(ugen, spec, inputs) {
    var buffer = _.findAudioBuffer(spec.buffer);
    var conv = ugen.$context.createConvolver();

    /* istanbul ignore else */
    if (buffer != null) {
      conv.buffer = buffer;
    }
    conv.normalize = !!_.defaults(spec.normalize, true);

    inputs.forEach(function(node) {
      _.connect({ from: node, to: conv });
    });

    return new neume.Unit({
      outlet: conv
    });
  });

};

},{}],24:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  var WEB_AUDIO_MAX_DELAY_TIME = 180;

  /**
   * +------------+
   * | ...inputs  |
   * +------------+
   *   |
   * +------------------------+
   * | DelayNode              |
   * | - delayTime: delayTime |
   * +------------------------+
   *   |
   */
  neume.register("delay", function(ugen, spec, inputs) {
    var delayTime = _.defaults(spec.delayTime, 0);
    var maxDelayTime;

    if (_.isNumber(delayTime)) {
      delayTime    = Math.max(0, Math.min(delayTime, WEB_AUDIO_MAX_DELAY_TIME));
      maxDelayTime = delayTime;
    } else {
      maxDelayTime = _.finite(_.defaults(spec.maxDelayTime, 1));
    }
    maxDelayTime = Math.max(1 / ugen.$context.sampleRate, Math.min(maxDelayTime, WEB_AUDIO_MAX_DELAY_TIME));

    var delay = ugen.$context.createDelay(maxDelayTime);

    delay.delayTime.value = 0;
    _.connect({ from: _.defaults(spec.delayTime, 0), to: delay.delayTime });

    inputs.forEach(function(node) {
      _.connect({ from: node, to: delay });
    });

    return new neume.Unit({
      outlet: delay
    });
  });

};

},{}],25:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";


  /**
   * $("env", {
   *   init   : number           = 0
   *   table  : array<env-table> = []
   *   release: number           = Infinity
   * })
   *
   * env-table:
   *   [ duration, target, curve ]
   *
   * aliases:
   *   $("adsr", {
   *     a    : number = 0.01   attackTime
   *     d    : number = 0.30   decayTime
   *     s    : number = 0.50   sustainLevel
   *     r    : number = 1.00   releaseTime
   *     curve: number = 0.001  curve
   *   })
   *
   * +--------+      +-------+
   * | inputs |  or  | DC(1) |
   * +--------+      +-------+
   *   ||||||
   * +---------------+
   * | GainNode      |
   * | - gain: value |
   * +---------------+
   *   |
   */
  neume.register("env", function(ugen, spec, inputs) {
    var init  = _.finite(_.defaults(spec.init, 0));
    var table = _.isArray(spec.table) ? spec.table : [];
    var releaseNode = _.num(_.defaults(spec.release, Infinity));

    return make(init, table, releaseNode, ugen, spec, inputs);
  });

  neume.register("adsr", function(ugen, spec, inputs) {
    var a = _.finite(_.defaults(spec.a, 0.01));
    var d = _.finite(_.defaults(spec.d, 0.30));
    var s = _.finite(_.defaults(spec.s, 0.50));
    var r = _.finite(_.defaults(spec.r, 1.00));
    var curve = _.finite(_.defaults(spec.curve, 0.001));

    var init = 0;
    var table = [
      [ a, 1, curve ], // a
      [ d, s, curve ], // d,
      [ r, 0, curve ], // r
    ];
    var releaseNode = 2;

    return make(init, table, releaseNode, ugen, spec, inputs);
  });

  function make(init, table, releaseNode, ugen, spec, inputs) {
    var context = ugen.$context;

    var env  = context.createGain();
    var gain = env.gain;
    var startTable = table.slice(0, releaseNode);
    var stopTable  = table.slice(releaseNode);

    var releaseValue = startTable.length ? _.finite(_.last(startTable)[1]) : init;
    var schedId = 0;

    if (_.isEmpty(inputs)) {
      inputs = [ new neume.DC(context, 1) ];
    }

    inputs.forEach(function(node) {
      _.connect({ from: node, to: env });
    });

    gain.value = init;

    function start(t) {
      var v0 = init;
      var t0 = t;

      gain.setValueAtTime(v0, t0);
      schedule(gain, startTable, v0, t0);
    }

    function stop() {
      context.unsched(schedId);
      schedId = 0;
    }

    function release(t) {
      var v0 = releaseValue;
      var t0 = t;
      var t1 = schedule(gain, stopTable, v0, t0);

      schedId = context.sched(t1, function(t) {
        schedId = 0;
        ugen.emit("end", { playbackTime: t }, ugen.$synth);
      });
    }

    return new neume.Unit({
      outlet: env,
      start : start,
      stop  : stop,
      methods: {
        release: release
      }
    });
  }

  function schedule(gain, table, v0, t0) {
    table.forEach(function(params) {
      var dur = _.finite(params[0]);
      var t1  = t0 + dur;
      var v1  = _.finite(params[1]);
      var cur = _.finite(params[2]);

      if (v0 === v1 || dur <= 0) {
        gain.setValueAtTime(v1, t0);
      } else if (0 < cur && cur < 1) {
        gain.setTargetAtTime(v1, t0, timeConstant(dur, v0, v1, cur));
      }

      t0 = t1;
      v0 = v1;
    });

    return t0;
  }

  function timeConstant(duration, startValue, endValue, curve) {
    var targetValue = startValue + (endValue - startValue) * (1 - curve);

    return -duration / Math.log((targetValue - endValue) / (startValue - endValue));
  }

};

},{}],26:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /* istanbul ignore next */
  var NOP = function() {};

  neume.register("function", function(ugen, spec, inputs) {
    var context = ugen.$context;

    var gain  = context.createGain();
    var data  = _.isFunction(spec.value) ? spec.value : /* istanbul ignore next */ NOP;
    var lag   = _.finite(spec.lag);
    var curve = _.finite(spec.curve);
    var count = 0;

    if (_.isEmpty(inputs)) {
      inputs = [ new neume.DC(context, 1) ];
    }

    inputs.forEach(function(node) {
      _.connect({ from: node, to: gain });
    });

    var prevValue = _.finite(data(0, count++));

    gain.gain.setValueAtTime(prevValue, 0);

    function update(t0) {
      var v0 = prevValue;
      var v1 = _.finite(data(t0, count++));

      if (lag <= 0 || curve < 0 || 1 <= curve) {
        gain.gain.setValueAtTime(v1, t0);
      } else {
        gain.gain.setTargetAtTime(v1, t0, timeConstant(lag, v0, v1, curve));
      }

      prevValue = v1;
    }

    return new neume.Unit({
      outlet: gain,
      methods: {
        setValue: function(t, value) {
          if (_.isFunction(value)) {
            context.sched(t, function() {
              data = value;
            });
          }
        },
        execute: function(t) {
          context.sched(t, function() {
            update(t);
          });
        }
      }
    });
  });

  function timeConstant(duration, startValue, endValue, curve) {
    var targetValue = startValue + (endValue - startValue) * (1 - curve);

    return -duration / Math.log((targetValue - endValue) / (startValue - endValue));
  }

};

},{}],27:[function(require,module,exports){
module.exports = function(neume) {
  "use strict";

  neume.use(require("./add"));
  neume.use(require("./array"));
  neume.use(require("./biquad"));
  neume.use(require("./boolean"));
  neume.use(require("./buf"));
  neume.use(require("./comp"));
  neume.use(require("./conv"));
  neume.use(require("./delay"));
  neume.use(require("./env"));
  neume.use(require("./function"));
  neume.use(require("./line"));
  neume.use(require("./media-stream"));
  neume.use(require("./media"));
  neume.use(require("./mul"));
  neume.use(require("./noise"));
  neume.use(require("./number"));
  neume.use(require("./osc"));
  neume.use(require("./shaper"));

};

},{"./add":17,"./array":18,"./biquad":19,"./boolean":20,"./buf":21,"./comp":22,"./conv":23,"./delay":24,"./env":25,"./function":26,"./line":28,"./media":30,"./media-stream":29,"./mul":31,"./noise":32,"./number":33,"./osc":34,"./shaper":35}],28:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /*
   * $("line", {
   *   start: number=1
   *   end  : number=1e-6
   *   dur  : number=1
   * } ... inputs)
   *
   * $("xline", {
   *   start: number=1
   *   end  : number=1e-6
   *   dur  : number=1
   * } ... inputs)
   *
   * +--------+      +-------+
   * | inputs |  or  | DC(1) |
   * +--------+      +-------+
   *   ||||||
   * +---------------+
   * | GainNode      |
   * | - gain: value |
   * +---------------+
   *   |
   */
  neume.register("line", function(ugen, spec, inputs) {
    return make("linearRampToValueAtTime", ugen, spec, inputs);
  });

  neume.register("xline", function(ugen, spec, inputs) {
    return make("exponentialRampToValueAtTime", ugen, spec, inputs);
  });

  function make(curve, ugen, spec, inputs) {
    var context = ugen.$context;

    var line  = context.createGain();
    var gain  = line.gain;
    var startValue = _.finite(_.defaults(spec.start, 1));
    var endValue   = _.finite(_.defaults(spec.end  , 1e-6));
    var duration   = _.finite(_.defaults(spec.dur  , 1));
    var schedId = 0;

    if (_.isEmpty(inputs)) {
      inputs = [ new neume.DC(context, 1) ];
    }

    inputs.forEach(function(input) {
      _.connect({ from: input, to: line });
    });

    gain.setValueAtTime(startValue, 0);

    function start(t) {
      var t0 = t;
      var t1 = t0 + duration;

      gain.setValueAtTime(startValue, t0);
      gain[curve](endValue, t1);

      schedId = context.sched(t1, function(t) {
        schedId = 0;
        ugen.emit("end", { playbackTime: t }, ugen.$synth);
      });
    }

    function stop() {
      context.unsched(schedId);
    }

    return new neume.Unit({
      outlet: line,
      start : start,
      stop  : stop
    });
  }

};

},{}],29:[function(require,module,exports){
module.exports = function(neume) {
  "use strict";

  neume.register("media-stream", function(ugen, spec) {
    return make(setup(ugen, spec.stream));
  });

  function setup(ugen, stream) {
    if (window.MediaStream && stream instanceof window.MediaStream) {
      return ugen.$context.createMediaStreamSource(stream);
    }
    return null;
  }

  function make(outlet) {
    return new neume.Unit({
      outlet: outlet
    });
  }
};

},{}],30:[function(require,module,exports){
module.exports = function(neume) {
  "use strict";

  neume.register("media", function(ugen, spec) {
    return make(setup(ugen, spec.media));
  });

  neume.register("htmlaudioelement", function(ugen, spec) {
    return make(setup(ugen, spec.value));
  });

  neume.register("htmlvideoelement", function(ugen, spec) {
    return make(setup(ugen, spec.value));
  });

  function setup(ugen, media) {
    if (window.HTMLMediaElement && media instanceof window.HTMLMediaElement) {
      return ugen.$context.createMediaElementSource(media);
    }
    return null;
  }

  function make(outlet) {
    return new neume.Unit({
      outlet: outlet
    });
  }
};

},{}],31:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /*
   * +-----------+
   * | inputs[0] |
   * +-----------+
   *   |
   * +-----------+
   * | GainNode  |  +-----------+
   * | - gain: 0 |--| inputs[1] |
   * +-----------+  +-----------+
   *   |
   * +-----------+
   * | GainNode  |  +-----------+
   * | - gain: 0 |--| inputs[2] |
   * +-----------+  +-----------+
   *   |
   * +-----------------------------------+
   * | GainNode                          |
   * | - gain: mul extracted from inputs |
   * +-----------------------------------+
   *   |
   */
  neume.register("*", function(ugen, spec, inputs) {
    var outlet = null;

    var context = ugen.$context;
    var parts  = _.partition(inputs, _.isNumber);
    var nodes  = _.second(parts);
    var multiple = _.reduce(_.first(parts), function(a, b) {
      return a * b;
    }, 1);

    if (multiple === 0) {
      outlet = new neume.DC(context, 0);
      nodes  = [];
    } else {
      outlet = _.first(nodes) || new neume.DC(context, 1);
      nodes  = _.rest(nodes);
    }

    outlet = _.reduce(nodes, function(outlet, node) {
      var gain = context.createGain();

      gain.gain.value = 0;

      _.connect({ from: node, to: gain.gain });
      _.connect({ from: outlet, to: gain });

      return gain;
    }, outlet);

    if (multiple !== 0 && multiple !== 1) {
      var tmp = outlet;

      outlet = context.createGain();

      outlet.gain.value = multiple;
      _.connect({ from: tmp, to: outlet });
    }

    return new neume.Unit({
      outlet: outlet
    });

  });

};

},{}],32:[function(require,module,exports){
module.exports = function(neume) {
  "use strict";

  /**
   * +------------------+
   * | BufferSourceNode |
   * | - loop: true     |
   * +------------------+
   *   |
   */
  neume.register("white", function(ugen) {
    whiteNoise = whiteNoise || generateWhiteNoise(ugen.$context.sampleRate);
    return make(whiteNoise, ugen);
  });

  neume.register("pink", function(ugen) {
    pinkNoise = pinkNoise || generatePinkNoise(ugen.$context.sampleRate);
    return make(pinkNoise, ugen);
  });

  function make(data, ugen) {
    var buf = ugen.$context.createBuffer(1, data.length, ugen.$context.sampleRate);
    var bufSrc = ugen.$context.createBufferSource();

    buf.getChannelData(0).set(data);

    bufSrc.buffer = buf;
    bufSrc.loop   = true;

    return new neume.Unit({
      outlet: bufSrc,
      start: function(t) {
        bufSrc.start(t);
      },
      stop: function(t) {
        bufSrc.stop(t);
      }
    });
  }

  var whiteNoise = null;
  var pinkNoise  = null;

  function generateWhiteNoise(sampleRate) {
    var noise = new Float32Array(sampleRate);

    for (var i = 0, imax = noise.length; i < imax; i++) {
      noise[i] = Math.random() * 2.0 - 1.0;
    }

    return noise;
  }

  function generatePinkNoise(sampleRate) {
    var noise = new Float32Array(sampleRate);

    var whites = new Uint8Array([
      (Math.random() * 1073741824) % 25,
      (Math.random() * 1073741824) % 25,
      (Math.random() * 1073741824) % 25,
      (Math.random() * 1073741824) % 25,
      (Math.random() * 1073741824) % 25,
    ]);

    var MAX_KEY = 31;
    var key = 0;
    var last_key, diff;

    for (var i = 0, imax = noise.length; i < imax; i++) {
      last_key = key++;
      key &= MAX_KEY;

      diff = last_key ^ key;

      var sum = 0;
      for (var j = 0; j < 5; ++j) {
        if (diff & (1 << j)) {
          whites[j] = (Math.random() * 1073741824) % 25;
        }
        sum += whites[j];
      }

      noise[i] = (sum * 0.01666666) - 1;
    }

    return noise;
  }

};

},{}],33:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /**
   * $(number, {
   *   lag  : number = 0
   *   curve: number = 0
   * } ... inputs)
   *
   * methods:
   *   setValue(t, value)
   *
   * +--------+      +-------+
   * | inputs |  or  | DC(1) |
   * +--------+      +-------+
   *   ||||||
   * +---------------+
   * | GainNode      |
   * | - gain: value |
   * +---------------+
   *   |
   */
  neume.register("number", function(ugen, spec, inputs) {
    var context = ugen.$context;

    var gain  = context.createGain();
    var data  = _.finite(spec.value);
    var lag   = _.finite(spec.lag);
    var curve = _.finite(spec.curve);

    if (_.isEmpty(inputs)) {
      inputs = [ new neume.DC(context, 1) ];
    }

    inputs.forEach(function(node) {
      _.connect({ from: node, to: gain });
    });

    gain.gain.setValueAtTime(data, 0);

    function update(t0, v0, v1, nextData) {
      if (lag <= 0 || curve < 0 || 1 <= curve) {
        gain.gain.setValueAtTime(v1, t0);
      } else {
        gain.gain.setTargetAtTime(v1, t0, timeConstant(lag, v0, v1, curve));
      }
      data = nextData;
    }

    return new neume.Unit({
      outlet: gain,
      methods: {
        setValue: function(t, value) {
          if (_.isFinite(value)) {
            context.sched(t, function() {
              update(t, data, value, value);
            });
          }
        }
      }
    });
  });

  function timeConstant(duration, startValue, endValue, curve) {
    var targetValue = startValue + (endValue - startValue) * (1 - curve);

    return -duration / Math.log((targetValue - endValue) / (startValue - endValue));
  }

};

},{}],34:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  /**
   * $("osc", {
   *   type  : [string|PeriodicWave]="sin",
   *   freq  : [number|UGen]=440,
   *   detune: [number|UGen]=0
   * } ... inputs)
   *
   * aliases:
   *   $("sin"), $("square"), $("saw"), $("tri"), $(PeriodicWave)
   *
   * start:
   *   start OscillatorNode
   *
   * stop:
   *   stop OscillatorNode
   *
   *
   * no inputs
   * +------------------------+
   * | OscillatorNode         |
   * | - type: type           |
   * | - frequency: freq(440) |
   * | - detune: detune(0)    |
   * +------------------------+
   *   |
   *
   * has inputs
   * +--------+
   * | inputs |
   * +--------+     +----------------------+
   *   ||||||       | OscillatorNode       |
   * +-----------+  | - type: type         |
   * | GainNode  |  | - frequency: freq(2) |
   * | - gain: 0 |--| - detune: detune(0)  |
   * +-----------+  +----------------------+
   *   |
   */

  var WAVE_TYPES = {
    sin   : "sine",
    square: "square",
    saw   : "sawtooth",
    tri   : "triangle"
  };

  neume.register("osc", function(ugen, spec, inputs) {
    var type = spec.type;
    var wave = null;

    if (type instanceof window.PeriodicWave) {
      wave = type;
      type = "custom";
    } else {
      type = WAVE_TYPES[type] || "sine";
    }

    var osc  = setup(type, ugen, spec, inputs);
    var ctrl = osc.ctrl;

    if (wave) {
      ctrl.setPeriodicWave(wave);
    }

    return make(osc);
  });

  neume.register("periodicwave", function(ugen, spec, inputs) {
    var type = "custom";
    var wave = spec.value;

    if (!(wave instanceof window.PeriodicWave)) {
      type = "sine";
      wave = null;
    }

    var osc  = setup(type, ugen, spec, inputs);
    var ctrl = osc.ctrl;

    if (wave) {
      ctrl.setPeriodicWave(wave);
    }

    return make(osc);
  });

  _.each(WAVE_TYPES, function(type, name) {
    neume.register(name, function(ugen, spec, inputs) {
      return make(setup(type, ugen, spec, inputs));
    });
  });

  function setup(type, ugen, spec, inputs) {
    return inputs.length ?
      hasInputs(type, ugen, spec, inputs) : noInputs(type, ugen, spec);
  }

  function make(osc) {
    var ctrl = osc.ctrl;

    return new neume.Unit({
      outlet: osc.outlet,
      start: function(t) {
        ctrl.start(t);
      },
      stop: function(t) {
        ctrl.stop(t);
      }
    });
  }

  function noInputs(type, ugen, spec) {
    var osc = ugen.$context.createOscillator();

    osc.type = type;
    osc.frequency.value = 0;
    osc.detune.value    = 0;
    _.connect({ from: _.defaults(spec.freq, 440), to: osc.frequency });
    _.connect({ from: _.defaults(spec.detune, 0), to: osc.detune });

    return { outlet: osc, ctrl: osc };
  }

  function hasInputs(type, ugen, spec, inputs) {
    var osc  = ugen.$context.createOscillator();
    var gain = ugen.$context.createGain();

    osc.type = type;
    osc.frequency.value = 0;
    osc.detune.value    = 0;
    _.connect({ from: _.defaults(spec.freq, 2), to: osc.frequency });
    _.connect({ from: _.defaults(spec.detune, 0), to: osc.detune });

    gain.gain.value = 0;
    _.connect({ from: osc, to: gain.gain });

    _.each(inputs, function(node) {
      _.connect({ from: node, to: gain });
    });

    return { outlet: gain, ctrl: osc };
  }

};

},{}],35:[function(require,module,exports){
module.exports = function(neume, _) {
  "use strict";

  var WS_CURVE_SIZE = 4096;

  /**
   * $("shaper", {
   *   curve: Float32Array|number = 0
   * } ... inputs)
   *
   * aliases:
   *   $("clip")
   *
   * +--------+
   * | inputs |
   * +--------+
   *   ||||||
   * +--------------------------+
   * | WaveShaperNode           |
   * | - curve: curve           |
   * | - oversample: oversample |
   * +--------------------------+
   *   |
   */
  neume.register("shaper", function(ugen, spec, inputs) {
    var curve = null;
    if (_.isNumber(spec.curve)) {
      curve = createCurve(spec.curve);
    } else {
      curve = spec.curve;
    }
    return make(setup(curve, ugen, spec, inputs));
  });

  neume.register("clip", function(ugen, spec, inputs) {
    var curve = createCurve(0);
    return make(setup(curve, ugen, spec, inputs));
  });

  function setup(curve, ugen, spec, inputs) {
    var shaper = ugen.$context.createWaveShaper();

    if (curve instanceof Float32Array) {
      shaper.curve = curve;
    }
    shaper.oversample = { "2x":"2x", "4x":"4x" }[spec.oversample] || "none";

    inputs.forEach(function(node) {
      _.connect({ from: node, to: shaper });
    });

    return shaper;
  }

  function make(outlet) {
    return new neume.Unit({
      outlet: outlet
    });
  }

  var curves = {};

  function createCurve(amount) {
    amount = Math.max(0, Math.min(amount, 1));

    if (!curves[amount]) {
      curves[amount] = (amount === 1) ? createSquare() : createWSCurve(amount);
    }

    return curves[amount];
  }

  // http://stackoverflow.com/questions/7840347/web-audio-api-waveshapernode
  function createWSCurve(amount) {
    var curve = new Float32Array(WS_CURVE_SIZE);

    var k = 2 * amount / (1 - amount);

    for (var i = 0; i < WS_CURVE_SIZE; i++) {
      var x = i * 2 / WS_CURVE_SIZE - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }

    return curve;
  }

  function createSquare() {
    var curve = new Float32Array(WS_CURVE_SIZE);
    var half  = WS_CURVE_SIZE >> 1;

    for (var i = 0; i < WS_CURVE_SIZE; i++) {
      curve[i] = i < half ? -1 : +1;
    }

    return curve;
  }
};

},{}],36:[function(require,module,exports){
"use strict";

var _ = require("./utils");

var INIT  = 0;
var START = 1;
var STOP  = 2;

function NeuUnit(spec) {
  this._spec   = spec;
  this._state  = INIT;
  this.$outlet  = _.defaults(spec.outlet, null);
  this.$methods = _.defaults(spec.methods, {});
}

NeuUnit.prototype.start = function(t) {
  if (this._state === INIT && _.isFunction(this._spec.start)) {
    this._state = START;
    this._spec.start(_.finite(t));
  }
};

NeuUnit.prototype.stop = function(t) {
  if (this._state === START && _.isFunction(this._spec.stop)) {
    this._state = STOP;
    this._spec.stop(_.finite(t));
  }
};

NeuUnit.prototype.apply = function(method, args) {
  if (this.$methods[method]) {
    this.$methods[method].apply(null, args);
  }
};

module.exports = NeuUnit;

},{"./utils":37}],37:[function(require,module,exports){
"use strict";

var utils = {};

utils.isArray = function(value) {
  return Array.isArray(value);
};

utils.isBoolean = function(value) {
  return typeof value === "boolean";
};

utils.isDictionary = function(value) {
  return value != null && value.constructor === Object;
};

utils.isFunction = function(value) {
  return typeof value === "function";
};

utils.isFinite = function(value) {
  return typeof value === "number" && isFinite(value);
};

utils.isNaN = function(value) {
  return value !== value;
};

utils.isNull = function(value) {
  return value === null;
};

utils.isNumber = function(value) {
  return typeof value === "number" && !isNaN(value);
};

utils.isObject = function(value) {
  var type = typeof value;
  return type === "function" || type === "object" && value !== null;
};

utils.isString = function(value) {
  return typeof value === "string";
};

utils.isTypedArray = function(value) {
  return value instanceof Float32Array ||
    value instanceof Uint8Array ||
    value instanceof Int8Array ||
    value instanceof Uint16Array ||
    value instanceof Int16Array ||
    value instanceof Uint32Array ||
    value instanceof Int32Array ||
    value instanceof Float64Array ||
    value instanceof Uint8ClampedArray;
};

utils.isUndefined = function(value) {
  return value === void 0;
};

utils.toArray = function(value) {
  if (value == null) {
    return [];
  }
  return Array.prototype.slice.call(value);
};

utils.fill = function(list, value) {
  for (var i = 0, imax = list.length; i < imax; i++) {
    list[i] = value;
  }
  return list;
};

utils.isEmpty = function(list) {
  return list.length === 0;
};

utils.first = function(list) {
  return list[0];
};

utils.second = function(list) {
  return list[1];
};

utils.last = function(list) {
  return list[list.length - 1];
};

utils.clipAt = function(list, index) {
  return list[Math.max(0, Math.min(index|0, list.length - 1))];
};

utils.wrapAt = function(list, index) {
  index = index|0;

  index %= list.length;
  if (index < 0) {
    index += list.length;
  }

  return list[index];
};

utils.foldAt = function(list, index) {
  index = index|0;

  var len2 = list.length * 2 - 2;

  index = index % len2;

  if (index < 0) {
    index += len2;
  }

  if (list.length <= index) {
    index = len2 - index;
  }

  return list[index];
};

utils.rest = function(list) {
  return list.slice(1);
};

utils.each = function(list, func, ctx) {
  var i, len, keys;

  if (list != null) {
    func = func.bind(ctx);
    len  = list.length;
    if (len === +len) {
      for (i = 0; i < len; ++i) {
        func(list[i], i, list);
      }
    } else {
      keys = Object.keys(list);
      len  = keys.length;
      for (i = 0; i < len; ++i) {
        func(list[keys[i]], keys[i], list);
      }
    }
  }

  return list;
};

utils.collect = function(list, func, ctx) {
  var result = [];

  func = func.bind(ctx);

  utils.each(list, function(elem, index) {
    result.push(func(elem, index, list));
  });

  return result;
};

utils.select = function(list, pred, ctx) {
  var result = [];

  pred = pred.bind(ctx);

  utils.each(list, function(elem, index) {
    if (pred(elem, index, list)) {
      result.push(elem);
    }
  });

  return result;
};

utils.reject = function(list, pred, ctx) {
  var result = [];

  pred = pred.bind(ctx);

  utils.each(list, function(elem, index) {
    if (!pred(elem, index, list)) {
      result.push(elem);
    }
  });

  return result;
};

utils.partition = function(list, pred, ctx) {
  var selected = [];
  var rejected = [];

  pred = pred.bind(ctx);

  utils.each(list, function(elem, index) {
    (pred(elem, index, list) ? selected : rejected).push(elem);
  });

  return [ selected, rejected ];
};

utils.reduce = function(list, func, init, ctx) {
  var result = init;

  func = func.bind(ctx);

  utils.each(list, function(elem, index) {
    result = func(result, elem, index, list);
  });

  return result;
};

utils.has = function(obj, key) {
  return obj != null && obj.hasOwnProperty(key);
};

utils.keys = function(obj) {
  return Object.keys(obj);
};

utils.values = function(obj) {
  return Object.keys(obj).map(function(key) {
    return obj[key];
  });
};

utils.pairs = function(obj) {
  return Object.keys(obj).map(function(key) {
    return [ key, obj[key] ];
  });
};

utils.definePropertyIfNotExists = function(obj, prop, descriptor) {
  if (!obj.hasOwnProperty(prop)) {
    Object.defineProperty(obj, prop, descriptor);
  }
  return obj;
};

utils.format = function(fmt, dict) {
  utils.each(dict, function(val, key) {
    if (/^\w+$/.test(key)) {
      fmt = fmt.replace(new RegExp("#\\{" + key + "\\}", "g"), val);
    }
  });
  return fmt;
};

utils.num = function(value) {
  return +value||0;
};

utils.int = function(value) {
  return +value|0;
};

utils.finite = function(value) {
  value = +value||0;
  if (!utils.isFinite(value)) {
    value = 0;
  }
  return value;
};

utils.typeOf = function(value) {
  if (utils.isNumber(value)) {
    return "number";
  }
  if (utils.isArray(value)) {
    return "array";
  }
  if (utils.isString(value)) {
    return "string";
  }
  if (utils.isFunction(value)) {
    return "function";
  }
  if (utils.isBoolean(value)) {
    return "boolean";
  }
  if (utils.isNull(value)) {
    return "null";
  }
  if (utils.isUndefined(value)) {
    return "undefined";
  }
  if (utils.isNaN(value)) {
    return "nan";
  }
  if (value.constructor && utils.isString(value.constructor.name)) {
    return value.constructor.name.toLowerCase();
  }
  return Object.prototype.toString.call(value).slice(8, -1).toLowerCase();
};

utils.defaults = function(value, defaultValue) {
  return value == null ? defaultValue : value;
};

utils.inherits = function(ctor, superCtor) {
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: { value: ctor, enumerable: false, writable: true, configurable: true }
  });
};

utils.isAudioContext = function(value) {
  return value instanceof window.AudioContext;
};

utils.isAudioNode = function(value) {
  return value instanceof window.AudioNode;
};

utils.isAudioParam = function(value) {
  return value instanceof window.AudioParam;
};

utils.findAudioContext = function(obj) {
  while (!(obj == null || utils.isAudioContext(obj))) {
    obj = obj.$context;
  }
  return obj || null;
};

utils.findAudioNode = function(obj) {
  while (!(obj == null || utils.isAudioNode(obj))) {
    obj = obj.$outlet;
  }
  return obj || null;
};

utils.findAudioBuffer = function(obj) {
  while (!(obj == null || obj instanceof window.AudioBuffer)) {
    obj = obj.$buffer;
  }
  return obj || null;
};

utils.isValidInput = function(value) {
  return utils.isFinite(value) || utils.isAudioNode(utils.findAudioNode(value));
};

utils.connect = function(spec) {
  var from = spec.from;
  var to   = spec.to;

  // FIXME: umm..
  if (utils.NeuParam && from instanceof utils.NeuParam) {
    return from._connect(to);
  }

  if (utils.isAudioParam(to)) {
    if (utils.isNumber(from)) {
      return to.setValueAtTime(utils.finite(from), 0);
    }
  }

  if (utils.isAudioNode(to) || utils.isAudioParam(to)) {
    from = utils.findAudioNode(from);
    if (from) {
      return from.connect(to);
    }
  }
};

utils.disconnect = function(spec) {
  var from = utils.findAudioNode(spec.from);

  /* istanbul ignore else */
  if (from) {
    from.disconnect();
  }
};

module.exports = utils;

},{}]},{},[1])