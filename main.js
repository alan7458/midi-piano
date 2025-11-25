/**
 * MAIN.js
 * Combined script.js and util.js to create a mess of
 * a file as shown below.
 * 
 * Author: Alan
 * Date: 24 November 2025
 */
function mixin(obj1, obj2) {
  for (var i in obj2) {
    if (obj2.hasOwnProperty(i)) obj1[i] = obj2[i];
  }
}
function EventEmitter() {
  this._events = {};
}
EventEmitter.prototype.on = function (evtn, fn) {
  if (!this._events.hasOwnProperty(evtn)) this._events[evtn] = [];
  this._events[evtn].push(fn);
};
EventEmitter.prototype.off = function (evtn, fn) {
  if (!this._events.hasOwnProperty(evtn)) return;
  var idx = this._events[evtn].indexOf(fn);
  if (idx < 0) return;
  this._events[evtn].splice(idx, 1);
};
EventEmitter.prototype.emit = function (evtn) {
  if (!this._events.hasOwnProperty(evtn)) return;
  var fns = this._events[evtn].slice(0);
  if (fns.length < 1) return;
  var args = Array.prototype.slice.call(arguments, 1);
  for (var i = 0; i < fns.length; i++) fns[i].apply(this, args);
};

var Rect = function (x, y, w, h) {
  this.x = x; this.y = y; this.w = w; this.h = h;
  this.x2 = x + w; this.y2 = y + h;
};
Rect.prototype.contains = function (x, y) {
  return x >= this.x && x <= this.x2 && y >= this.y && y <= this.y2;
};

var DEFAULT_VELOCITY = 0.5;

const BASIC_PIANO_SCALES = {
  "Notes in C Major": ["C", "D", "E", "F", "G", "A", "B", "C"],
  "Notes in D Major": ["D", "E", "G♭", "G", "A", "B", "D♭", "D"],
  "Notes in E Major": ["E", "G♭", "A♭", "A", "B", "D♭", "E♭", "E"],
  "Notes in F Major": ["F", "G", "A", "B♭", "C", "D", "E", "F"],
  "Notes in G Major": ["G", "A", "B", "C", "D", "E", "G♭", "G"],
  "Notes in A Major": ["A", "B", "D♭", "D", "E", "G♭", "A♭", "A"],
  "Notes in B Major": ["B", "D♭", "E♭", "E", "G♭", "A♭", "B♭", "B"],
  "Notes in C# / Db Major": ["D♭", "E♭", "F", "G♭", "A♭", "B♭", "C", "D♭"],
  "Notes in D# / Eb Major": ["E♭", "F", "G", "A♭", "B♭", "C", "D", "E♭"],
  "Notes in F# / Gb Major": ["G♭", "A♭", "B♭", "B", "D♭", "E♭", "F", "G♭"],
  "Notes in G# / Ab Major": ["A♭", "B♭", "C", "D♭", "E♭", "F", "G", "A♭"],
  "Notes in A# / Bb Major": ["B♭", "C", "D", "E♭", "F", "G", "A", "B♭"],
  "Notes in A Minor": ["A", "B", "C", "D", "E", "F", "G", "A"],
  "Notes in C Minor": ["C", "D", "E♭", "F", "G", "A♭", "B♭", "C"]
};



/**
 * AUDIO ENGINE!! BUT IT's HORRIBLE! Web Audio!!!!
 */
var AudioEngine = function () { };
AudioEngine.prototype.init = function (cb) {
  this.volume = 0.69;
  this.sounds = {};
  this.paused = true;
  return this;
};
AudioEngine.prototype.load = function (id, url, cb) { };
AudioEngine.prototype.play = function () { };
AudioEngine.prototype.stop = function () { };
AudioEngine.prototype.setVolume = function (vol) { this.volume = vol; };
AudioEngine.prototype.resume = function () { this.paused = false; };

// Then your optimized AudioEngineWeb (from previous snippet)
var AudioEngineWeb = function () {
  this.threshold = 0;
  this.sourcePool = [];
  this.gainPool = [];
};
AudioEngineWeb.prototype = new AudioEngine();
AudioEngineWeb.prototype.constructor = AudioEngineWeb;

AudioEngineWeb.prototype.init = function (cb) {
  AudioEngine.prototype.init.call(this);
  this.context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
  this.masterGain = this.context.createGain();
  this.masterGain.gain.value = this.volume;
  this.masterGain.connect(this.context.destination);

  this.limiterNode = this.context.createDynamicsCompressor();
  this.limiterNode.threshold.value = -10;
  this.limiterNode.knee.value = 0;
  this.limiterNode.ratio.value = 20;
  this.limiterNode.attack.value = 0;
  this.limiterNode.release.value = 0.1;
  this.limiterNode.connect(this.masterGain);

  this.pianoGain = this.context.createGain();
  this.pianoGain.gain.value = 0.5;
  this.pianoGain.connect(this.limiterNode);

  this.synthGain = this.context.createGain();
  this.synthGain.gain.value = 0.5;
  this.synthGain.connect(this.limiterNode);

  this.playings = {};

  if (cb) setTimeout(cb, 0);
  return this;
};

AudioEngineWeb.prototype.load = function (id, url, cb) {
  var audio = this;
  var req = new XMLHttpRequest();
  req.open("GET", url);
  req.responseType = "arraybuffer";
  req.onload = function () {
    audio.context.decodeAudioData(req.response, function (buffer) {
      audio.sounds[id] = buffer;
      if (cb) cb();
    }, function (err) {
      console.warn("Audio load failed for", url, req.status, err);
      if (cb) cb(err);
    });
  };
  req.send();
};

AudioEngineWeb.prototype.getSource = function () {
  if (this.sourcePool.length) return this.sourcePool.pop();
  return this.context.createBufferSource();
};

AudioEngineWeb.prototype.getGain = function () {
  if (this.gainPool.length) return this.gainPool.pop();
  var g = this.context.createGain();
  g.connect(this.pianoGain);
  return g;
};

AudioEngineWeb.prototype.releaseNode = function (source, gain) {
  try { source.disconnect(); } catch (e) { }
  gain.gain.value = 0;
  this.sourcePool.push(source);
  this.gainPool.push(gain);
};

AudioEngineWeb.prototype.actualPlay = function (id, vol, time, part_id, releaseTime = 0.5) {
  if (this.paused || !this.sounds[id]) return;

  var source = this.context.createBufferSource();
  source.buffer = this.sounds[id];

  var gain = this.getGain();
  gain.gain.value = vol;

  source.connect(gain);
  source.start(time);

  if (!this.playings[id]) this.playings[id] = [];
  this.playings[id].push({ source, gain, part_id, releaseTime });

  if (enableSynth) this.playings[id][this.playings[id].length - 1].voice = new synthVoice(id, time);
};



AudioEngineWeb.prototype.play = function (id, vol, delay_ms, part_id) {
  if (!this.sounds[id]) return;
  var time = this.context.currentTime + delay_ms / 1000;
  var delay = delay_ms - this.threshold;
  if (delay <= 0) this.actualPlay(id, vol, time, part_id);
  else this.worker.postMessage({
    delay: delay,
    args: { action: 0, id: id, vol: vol, time: time, part_id: part_id }
  });
};


AudioEngineWeb.prototype.actualStop = function (id, time, part_id) {
  var notes = this.playings[id];
  if (!notes || !notes.length) return;

  for (var i = 0; i < notes.length; i++) {
    var playing = notes[i];
    if (playing.part_id !== part_id) continue;

    var gain = playing.gain.gain;
    var releaseTime = playing.releaseTime || 0.2; // default short fade

    gain.setValueAtTime(gain.value, time);
    gain.linearRampToValueAtTime(0, time + releaseTime);

    if (playing.voice) playing.voice.stop(time);

    setTimeout(() => {
      this.releaseNode(null, playing.gain);
    }, releaseTime * 1000 + 50);

    notes.splice(i, 1);
    break;
  }

  if (notes.length === 0) delete this.playings[id];
};

AudioEngineWeb.prototype.stop = function (id, delay_ms, part_id) {
  var time = this.context.currentTime + delay_ms / 1000;
  var delay = delay_ms - this.threshold;

  if (delay <= 0) this.actualStop(id, time, part_id);
  else this.worker.postMessage({
    delay: delay,
    args: { action: 1, id: id, time: time, part_id: part_id }
  });
};


AudioEngineWeb.prototype.stop = function (id, delay_ms, part_id) {
  var time = this.context.currentTime + delay_ms / 1000;
  var delay = delay_ms - this.threshold;
  if (delay <= 0) this.actualStop(id, time, part_id);
  else this.worker.postMessage({
    delay: delay,
    args: { action: 1, id: id, time: time, part_id: part_id }
  });
};

AudioEngineWeb.prototype.setVolume = function (vol) {
  AudioEngine.prototype.setVolume.call(this, vol);
  this.masterGain.gain.value = this.volume;
};

AudioEngineWeb.prototype.resume = function () {
  this.paused = false;
  try { this.context.resume(); } catch (e) { }
};

var Renderer = function () { };
Renderer.prototype.init = function (piano) {
  this.piano = piano;
  this.resize();
  return this;
};
Renderer.prototype.resize = function (width, height) {
  if (typeof width == "undefined") width = (this.piano.rootElement && $(this.piano.rootElement).width()) || 800;
  if (typeof height == "undefined") height = Math.floor(width * 0.2);
  if (this.piano.rootElement) {
    $(this.piano.rootElement).css({
      height: height + "px",
      marginTop: Math.floor($(window).height() / 2 - height / 2) + "px",
    });
  }
  this.width = width * (window.devicePixelRatio || 1);
  this.height = height * (window.devicePixelRatio || 1);
};
Renderer.prototype.visualize = function (key, color) { };

var CanvasRenderer = function () { Renderer.call(this); };
CanvasRenderer.prototype = new Renderer();

CanvasRenderer.prototype.init = function (piano) {
  this.canvas = document.createElement("canvas");
  this.ctx = this.canvas.getContext("2d");
  piano.rootElement.appendChild(this.canvas);

  Renderer.prototype.init.call(this, piano);

  var self = this;
  var render = function () {
    self.redraw();
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);

  var mouse_down = false;
  var last_key = null;
  $(piano.rootElement).mousedown(function (event) {
    mouse_down = true;
    if (!gNoPreventDefault) event.preventDefault();
    var pos = CanvasRenderer.translateMouseEvent(event);
    var hit = self.getHit(pos.x, pos.y);
    if (hit) {
      press(hit.key.note, hit.v);
      last_key = hit.key;
    }
  });
  piano.rootElement.addEventListener("touchstart", function (event) {
    mouse_down = true;
    if (!gNoPreventDefault) event.preventDefault();
    for (var i in event.changedTouches) {
      var pos = CanvasRenderer.translateMouseEvent(event.changedTouches[i]);
      var hit = self.getHit(pos.x, pos.y);
      if (hit) {
        press(hit.key.note, hit.v);
        last_key = hit.key;
      }
    }
  }, false);
  $(window).mouseup(function () {
    if (last_key) release(last_key.note);
    mouse_down = false;
    last_key = null;
  });

  return this;
};

CanvasRenderer.prototype.resize = function (width, height) {
  Renderer.prototype.resize.call(this, width, height);
  if (this.width < 52 * 2) this.width = 52 * 2;
  if (this.height < this.width * 0.2) this.height = Math.floor(this.width * 0.2);
  this.canvas.width = this.width;
  this.canvas.height = this.height;
  this.canvas.style.width = (this.width / (window.devicePixelRatio || 1)) + "px";
  this.canvas.style.height = (this.height / (window.devicePixelRatio || 1)) + "px";

  this.whiteKeyWidth = Math.floor(this.width / 52);
  this.whiteKeyHeight = Math.floor(this.height * 0.9);
  this.blackKeyWidth = Math.floor(this.whiteKeyWidth * 0.75);
  this.blackKeyHeight = Math.floor(this.height * 0.5);

  this.blackKeyOffset = Math.floor(this.whiteKeyWidth - this.blackKeyWidth / 2);
  this.keyMovement = Math.floor(this.whiteKeyHeight * 0.015);

  this.whiteBlipWidth = Math.floor(this.whiteKeyWidth * 0.7);
  this.whiteBlipHeight = Math.floor(this.whiteBlipWidth * 0.8);
  this.whiteBlipX = Math.floor((this.whiteKeyWidth - this.whiteBlipWidth) / 2);
  this.whiteBlipY = Math.floor(this.whiteKeyHeight - this.whiteBlipHeight * 1.2);
  this.blackBlipWidth = Math.floor(this.blackKeyWidth * 0.7);
  this.blackBlipHeight = Math.floor(this.blackBlipWidth * 0.8);
  this.blackBlipY = Math.floor(this.blackKeyHeight - this.blackBlipHeight * 1.2);
  this.blackBlipX = Math.floor((this.blackKeyWidth - this.blackBlipWidth) / 2);

  // prerender white key
  this.whiteKeyRender = document.createElement("canvas");
  this.whiteKeyRender.width = this.whiteKeyWidth;
  this.whiteKeyRender.height = this.height + 10;
  var ctx = this.whiteKeyRender.getContext("2d");
  if (ctx.createLinearGradient) {
    var gradient = ctx.createLinearGradient(0, 0, 0, this.whiteKeyHeight);
    gradient.addColorStop(0, "#eee"); gradient.addColorStop(0.75, "#fff"); gradient.addColorStop(1, "#dad4d4");
    ctx.fillStyle = gradient;
  } else ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#000"; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = 10;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, this.whiteKeyWidth - ctx.lineWidth, this.whiteKeyHeight - ctx.lineWidth);
  ctx.lineWidth = 4;
  ctx.fillRect(ctx.lineWidth / 2, ctx.lineWidth / 2, this.whiteKeyWidth - ctx.lineWidth, this.whiteKeyHeight - ctx.lineWidth);

  // prerender black key
  this.blackKeyRender = document.createElement("canvas");
  this.blackKeyRender.width = this.blackKeyWidth + 10;
  this.blackKeyRender.height = this.blackKeyHeight + 10;
  var ctx = this.blackKeyRender.getContext("2d");
  if (ctx.createLinearGradient) {
    var gradient = ctx.createLinearGradient(0, 0, 0, this.blackKeyHeight);
    gradient.addColorStop(0, "#000"); gradient.addColorStop(1, "#444");
    ctx.fillStyle = gradient;
  } else ctx.fillStyle = "#000";
  ctx.strokeStyle = "#222"; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = 8;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, this.blackKeyWidth - ctx.lineWidth, this.blackKeyHeight - ctx.lineWidth);
  ctx.lineWidth = 4;
  ctx.fillRect(ctx.lineWidth / 2, ctx.lineWidth / 2, this.blackKeyWidth - ctx.lineWidth, this.blackKeyHeight - ctx.lineWidth);

  // prerender shadows
  this.shadowRender = [];
  var y = -this.canvas.height * 2;
  for (var j = 0; j < 2; j++) {
    var canvas = document.createElement("canvas"); this.shadowRender[j] = canvas;
    canvas.width = this.canvas.width; canvas.height = this.canvas.height;
    var ctx = canvas.getContext("2d");
    var sharp = j ? true : false;
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)"; ctx.shadowBlur = this.keyMovement * 3;
    ctx.shadowOffsetY = -y + this.keyMovement;
    if (sharp) { ctx.shadowOffsetX = this.keyMovement; } else { ctx.shadowOffsetX = 0; ctx.shadowOffsetY = -y + this.keyMovement; }
    for (var i in this.piano.keys) {
      if (!this.piano.keys.hasOwnProperty(i)) continue;
      var key = this.piano.keys[i];
      if (key.sharp != sharp) continue;
      if (key.sharp) {
        ctx.fillRect(this.blackKeyOffset + this.whiteKeyWidth * key.spatial + ctx.lineWidth / 2, y + ctx.lineWidth / 2, this.blackKeyWidth - ctx.lineWidth, this.blackKeyHeight - ctx.lineWidth);
      } else {
        ctx.fillRect(this.whiteKeyWidth * key.spatial + ctx.lineWidth / 2, y + ctx.lineWidth / 2, this.whiteKeyWidth - ctx.lineWidth, this.whiteKeyHeight - ctx.lineWidth);
      }
    }
  }

  // update key rects
  for (var i in this.piano.keys) {
    if (!this.piano.keys.hasOwnProperty(i)) continue;
    var key = this.piano.keys[i];
    if (key.sharp) {
      key.rect = new Rect(this.blackKeyOffset + this.whiteKeyWidth * key.spatial, 0, this.blackKeyWidth, this.blackKeyHeight);
    } else {
      key.rect = new Rect(this.whiteKeyWidth * key.spatial, 0, this.whiteKeyWidth, this.whiteKeyHeight);
    }
  }
};

CanvasRenderer.prototype.visualize = function (key, color) {
  key.timePlayed = Date.now();
  key.blips.push({ time: key.timePlayed, color: color });
};

CanvasRenderer.prototype.redraw = function () {
  var now = Date.now();
  var timeLoadedEnd = now - 1000;
  var timePlayedEnd = now - 100;
  var timeBlipEnd = now - 1000;

  this.ctx.save();
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

  for (var j = 0; j < 2; j++) {
    this.ctx.globalAlpha = 1.0;
    this.ctx.drawImage(this.shadowRender[j], 0, 0);
    var sharp = j ? true : false;
    for (var i in this.piano.keys) {
      if (!this.piano.keys.hasOwnProperty(i)) continue;
      var key = this.piano.keys[i];
      if (key.sharp != sharp) continue;

      if (!key.loaded) {
        this.ctx.globalAlpha = 0.2;
      } else if (key.timeLoaded > timeLoadedEnd) {
        this.ctx.globalAlpha = ((now - key.timeLoaded) / 1000) * 0.8 + 0.2;
      } else {
        this.ctx.globalAlpha = 1.0;
      }
      var y = 0;
      if (key.timePlayed > timePlayedEnd) {
        y = Math.floor(this.keyMovement - ((now - key.timePlayed) / 100) * this.keyMovement);
      }
      var x = Math.floor(key.sharp ? this.blackKeyOffset + this.whiteKeyWidth * key.spatial : this.whiteKeyWidth * key.spatial);
      var image = key.sharp ? this.blackKeyRender : this.whiteKeyRender;
      this.ctx.drawImage(image, x, y);

      // NOTE LABELS REMOVED: original code drew key names here; removed per request.

      const highlightScale = BASIC_PIANO_SCALES[gHighlightScaleNotes];
      if (highlightScale && key.loaded) {
        var keyName = key.baseNote[0].toUpperCase();
        if (key.sharp) keyName += "#";
        keyName += key.octave + 1;
        keyName = keyName.replace("C#", "D♭").replace("D#", "E♭").replace("F#", "G♭").replace("G#", "A♭").replace("A#", "B♭");
        const keynameNoOctave = keyName.slice(0, -1);
        if (highlightScale.includes(keynameNoOctave)) {
          const prev = this.ctx.globalAlpha;
          this.ctx.globalAlpha = 0.3;
          this.ctx.fillStyle = "#0f0";
          if (key.sharp) this.ctx.fillRect(x, y, this.blackKeyWidth, this.blackKeyHeight);
          else this.ctx.fillRect(x, y, this.whiteKeyWidth, this.whiteKeyHeight);
          this.ctx.globalAlpha = prev;
        }
      }

      // render blips
      if (key.blips.length) {
        var alpha = this.ctx.globalAlpha;
        var w, h;
        if (key.sharp) {
          x += this.blackBlipX;
          y = this.blackBlipY;
          w = this.blackBlipWidth;
          h = this.blackBlipHeight;
        } else {
          x += this.whiteBlipX;
          y = this.whiteBlipY;
          w = this.whiteBlipWidth;
          h = this.whiteBlipHeight;
        }
        for (var b = 0; b < key.blips.length; b++) {
          var blip = key.blips[b];
          if (blip.time > timeBlipEnd) {
            //this.ctx.fillStyle = blip.color;
            this.ctx.fillStyle = "#ff0000"
            this.ctx.globalAlpha = alpha - ((now - blip.time) / 1000) * alpha;
            this.ctx.fillRect(x, y, w, h);
          } else {
            key.blips.splice(b, 1); --b;
          }
          y -= Math.floor(h * 1.1);
        }
      }
    }
  }

  this.ctx.restore();
};

CanvasRenderer.prototype.getHit = function (x, y) {
  for (var j = 0; j < 2; j++) {
    var sharp = j ? false : true; // black keys first
    for (var i in this.piano.keys) {
      if (!this.piano.keys.hasOwnProperty(i)) continue;
      var key = this.piano.keys[i];
      if (key.sharp != sharp) continue;
      if (key.rect.contains(x, y)) {
        var v = y / (key.sharp ? this.blackKeyHeight : this.whiteKeyHeight);
        v += 0.25; v *= DEFAULT_VELOCITY;
        if (v > 1.0) v = 1.0;
        return { key: key, v: v };
      }
    }
  }
  return null;
};

CanvasRenderer.isSupported = function () {
  var canvas = document.createElement("canvas");
  return !!(canvas.getContext && canvas.getContext("2d"));
};

CanvasRenderer.translateMouseEvent = function (evt) {
  var element = evt.target;
  var offx = 0; var offy = 0;
  do {
    if (!element) break;
    offx += element.offsetLeft;
    offy += element.offsetTop;
  } while ((element = element.offsetParent));
  return { x: (evt.pageX - offx) * (window.devicePixelRatio || 1), y: (evt.pageY - offy) * (window.devicePixelRatio || 1) };
};

/* SoundSelector - kept from original but simplified interaction */
if (window.location.hostname === "localhost") var soundDomain = `http://${location.host}`;
else var soundDomain = "https://multiplayerpiano.net";

function SoundSelector(piano) {
  this.initialized = false;
  this.keys = piano.keys;
  this.loading = {};
  this.notification = undefined;
  this.packs = [];
  this.piano = piano;
  this.soundSelection = localStorage.soundSelection ? localStorage.soundSelection : "mppclassic";
  this.addPack({ name: "MPP Classic", keys: Object.keys(this.piano.keys), ext: ".mp3", url: "/sounds/mppclassic/" });
}
SoundSelector.prototype.addPack = function (pack, load) {
  var self = this;
  self.loading[pack.url || pack] = true;
  function add(obj) {
    var added = false;
    for (var i = 0; self.packs.length > i; i++) {
      if (obj.name == self.packs[i].name) { added = true; break; }
    }
    if (added) return console.warn("Sounds already added!!");
    if (obj.url.substr(obj.url.length - 1) != "/") obj.url = obj.url + "/";
    var html = document.createElement("li");
    html.classList = "pack";
    html.innerText = obj.name + " (" + obj.keys.length + " keys)";
    html.onclick = function () { self.loadPack(obj.name); if (self.notification) self.notification.close(); };
    obj.html = html;
    self.packs.push(obj);
    self.packs.sort(function (a, b) { if (a.name < b.name) return -1; if (a.name > b.name) return 1; return 0; });
    if (load) self.loadPack(obj.name);
    delete self.loading[obj.url];
  }
  add(pack);
};
SoundSelector.prototype.addPacks = function (packs) {
  for (var i = 0; packs.length > i; i++) this.addPack(packs[i]);
};
SoundSelector.prototype.init = function () {
  var self = this;
  if (self.initialized) return console.warn("Sound selector already initialized!");
  if (!!Object.keys(self.loading).length) return setTimeout(function () { self.init(); }, 250);
  // keep UI hookup optional - just load chosen pack
  self.initialized = true;
  self.loadPack(self.soundSelection, true);
};
SoundSelector.prototype.loadPack = function (pack, f) {
  for (var i = 0; this.packs.length > i; i++) { if (this.packs[i].name == pack) { pack = this.packs[i]; break; } }
  if (typeof pack == "string") return this.loadPack("Emotional");
  if (pack.name == this.soundSelection && !f) return;
  if (pack.keys.length != Object.keys(this.piano.keys).length) {
    this.piano.keys = {};
    for (var i = 0; pack.keys.length > i; i++) this.piano.keys[pack.keys[i]] = this.keys[pack.keys[i]];
    this.piano.renderer.resize();
  }
  var self = this;
  for (var i in this.piano.keys) {
    if (!this.piano.keys.hasOwnProperty(i)) continue;
    (function () {
      var key = self.piano.keys[i];
      key.loaded = false;
      let useDomain = true;
      if (pack.url.match(/^(http|https):\/\//i)) useDomain = false;
      self.piano.audio.load(key.note, (useDomain ? soundDomain : "") + pack.url + key.note + pack.ext, function () {
        key.loaded = true; key.timeLoaded = Date.now();
      });
    })();
  }
  if (localStorage) localStorage.soundSelection = pack.name;
  this.soundSelection = pack.name;
};
SoundSelector.prototype.removePack = function (name) {
  for (var i = 0; this.packs.length > i; i++) {
    var pack = this.packs[i];
    if (pack.name == name) { this.packs.splice(i, 1); if (pack.name == this.soundSelection) this.loadPack(this.packs[0].name); break; }
  }
};

/* Piano classes */
var PianoKey = function (note, octave) {
  this.note = note + octave;
  this.baseNote = note;
  this.octave = octave;
  this.sharp = note.indexOf("s") != -1;
  this.loaded = false;
  this.timeLoaded = 0;
  this.domElement = null;
  this.timePlayed = 0;
  this.blips = [];
};

var Piano = function (rootElement) {
  var piano = this;
  piano.rootElement = rootElement;
  piano.keys = {};

  var white_spatial = 0;
  var black_spatial = 0;
  var black_it = 0;
  var black_lut = [2, 1, 2, 1, 1];
  var addKey = function (note, octave) {
    var key = new PianoKey(note, octave);
    piano.keys[key.note] = key;
    if (key.sharp) {
      key.spatial = black_spatial;
      black_spatial += black_lut[black_it % 5];
      ++black_it;
    } else {
      key.spatial = white_spatial; ++white_spatial;
    }
  };

  var test_mode = window.location.hash && window.location.hash.match(/^(?:#.+)*#test(?:#.+)*$/i);
  if (test_mode) {
    addKey("c", 2);
  } else {
    addKey("a", -1); addKey("as", -1); addKey("b", -1);
    var notes = "c cs d ds e f fs g gs a as b".split(" ");
    for (var oct = 0; oct < 7; oct++) {
      for (var i in notes) addKey(notes[i], oct);
    }
    addKey("c", 7);
  }

  this.renderer = new CanvasRenderer().init(this);
  window.addEventListener("resize", function () { piano.renderer.resize(); });

  var audio_engine = AudioEngineWeb;
  this.audio = new audio_engine().init();
};

Piano.prototype.play = function (note, vol, participant, delay_ms, lyric) {
  if (!this.keys.hasOwnProperty(note) || !participant) return;
  var key = this.keys[note];
  if (key.loaded) this.audio.play(key.note, vol, delay_ms, participant.id);
  var self = this;
  setTimeout(function () {
    self.renderer.visualize(key, participant.color);
    // no nameDiv UI in single-player mode
  }, delay_ms || 0);
};

Piano.prototype.stop = function (note, participant, delay_ms) {
  if (!this.keys.hasOwnProperty(note) || !participant) return;
  var key = this.keys[note];
  if (key.loaded) this.audio.stop(key.note, delay_ms, participant.id);
};

/* simple note quota replacement so original logic still works */
var gNoteQuota = { spend: function (n) { return true; } };

/* local participant used for visuals and ids */
var localParticipant = {
  id: "local",
  color: localStorage.color || "#ecfaed",
  nameDiv: document.createElement("div")
};

/* flags used in renderer and other features */
var gNoPreventDefault = false;
var gShowPianoNotes = false; // ensure labels hidden
var gHighlightScaleNotes = ""; // can be set to a key name to highlight

/* create piano */
var pianoRoot = document.getElementById("piano");
if (!pianoRoot) {
  pianoRoot = document.createElement("div");
  pianoRoot.id = "piano";
  document.body.appendChild(pianoRoot);
}
var gPiano = new Piano(pianoRoot);

/* sound selector and pack list */
var gSoundSelector = new SoundSelector(gPiano);
gSoundSelector.addPacks([
  {
    name: "Emotional",
    keys: Object.keys(gPiano.keys),
    ext: ".mp3",
    url: "/sounds/Emotional/"
  },
  {
    name: "New Piano",
    keys: Object.keys(gPiano.keys),
    ext: ".mp3",
    url: "/sounds/NewPiano/"
  },
  {
    name: "Soft Piano",
    keys: Object.keys(gPiano.keys),
    ext: ".mp3",
    url: "/sounds/SoftPiano/"
  }
]);

gSoundSelector.init();
gSoundSelector.loadPack('MPP Classic', true);


/* sustain & held state */
var gAutoSustain = false;
var gSustain = false;
var gHeldNotes = {};
var gSustainedNotes = {};

/* press / release functions (callable externally) */
function press(id, vol) {
  if (gNoteQuota.spend(1)) {
    gHeldNotes[id] = true;
    gSustainedNotes[id] = true;
    gPiano.play(id, vol !== undefined ? vol : DEFAULT_VELOCITY, localParticipant, 0);
    // no network startNote
  }
}

function release(id) {
  if (gHeldNotes[id]) {
    gHeldNotes[id] = false;
    if ((gAutoSustain || gSustain) && !enableSynth) {
      gSustainedNotes[id] = true;
    } else {
      if (gNoteQuota.spend(1)) {
        gPiano.stop(id, localParticipant, 0);
        // no network stopNote
        gSustainedNotes[id] = false;
      }
    }
  }
}

function pressSustain() { gSustain = true; }
function releaseSustain() {
  gSustain = false;
  if (!gAutoSustain) {
    for (var id in gSustainedNotes) {
      if (gSustainedNotes.hasOwnProperty(id) && gSustainedNotes[id] && !gHeldNotes[id]) {
        gSustainedNotes[id] = false;
        if (gNoteQuota.spend(1)) gPiano.stop(id, localParticipant, 0);
      }
    }
  }
}

/* minimal MIDI support (kept behavior similar to original) */
var MIDI_TRANSPOSE = -12;
var MIDI_KEY_NAMES = ["a-1", "as-1", "b-1"];
var bare_notes = "c cs d ds e f fs g gs a as b".split(" ");
for (var oct = 0; oct < 7; oct++) {
  for (var i in bare_notes) MIDI_KEY_NAMES.push(bare_notes[i] + oct);
}
MIDI_KEY_NAMES.push("c7");

if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess().then(function (midi) {
    function midimessagehandler(evt) {
      var channel = evt.data[0] & 0xf;
      var cmd = evt.data[0] >> 4;
      var note_number = evt.data[1];
      var vel = evt.data[2];
      if (cmd == 8 || (cmd == 9 && vel == 0)) {
        release(MIDI_KEY_NAMES[note_number - 9 + MIDI_TRANSPOSE]);
      } else if (cmd == 9) {
        var noteName = MIDI_KEY_NAMES[note_number - 9 + MIDI_TRANSPOSE];
        press(noteName, (vel / 127) * DEFAULT_VELOCITY);
      }
    }
    var inputs = midi.inputs.values();
    for (var input = inputs.next(); input && !input.done; input = inputs.next()) {
      input.value.onmidimessage = midimessagehandler;
      input.value.enabled = true;
      input.value.volume = 1.0;
    }
    midi.onstatechange = function (e) {
      // rebind newly connected devices
      var inputs = midi.inputs.values();
      for (var input = inputs.next(); input && !input.done; input = inputs.next()) {
        input.value.onmidimessage = midimessagehandler;
        input.value.enabled = true;
      }
    };
  });
}

/* synth support (kept from original) */
var enableSynth = false;
var audio = gPiano.audio;
var context = gPiano.audio.context;
var synth_gain = context.createGain();
synth_gain.gain.value = 0.05;
synth_gain.connect(audio.synthGain);

var osc_types = ["sine", "square", "sawtooth", "triangle"];
var osc1_type = "square";
var osc1_attack = 0;
var osc1_decay = 0.2;
var osc1_sustain = 0.5;
var osc1_release = 2.0;

function synthVoice(note_name, time) {
  var note_number = (function () {
    return MIDI_KEY_NAMES.indexOf(note_name);
  })();
  var freq = Math.pow(2, (note_number - 69) / 12) * 440.0;
  this.osc = context.createOscillator();
  this.osc.type = osc1_type;
  this.osc.frequency.value = freq;
  this.gain = context.createGain();
  this.gain.gain.value = 0;
  this.osc.connect(this.gain);
  this.gain.connect(synth_gain);
  this.osc.start(time);
  this.gain.gain.setValueAtTime(0, time);
  this.gain.gain.linearRampToValueAtTime(1, time + osc1_attack);
  this.gain.gain.linearRampToValueAtTime(osc1_sustain, time + osc1_attack + osc1_decay);
}
synthVoice.prototype.stop = function (time) {
  this.gain.gain.linearRampToValueAtTime(0, time + osc1_release);
  this.osc.stop(time + osc1_release);
};

window.MPP = {
  press: press,
  release: release,
  pressSustain: pressSustain,
  releaseSustain: releaseSustain,
  piano: gPiano,
  soundSelector: gSoundSelector,
  // no client, no chat
};

var gMidiOutTest = null;
var gDisableMIDIDrumChannel = false;
var gNoPreventDefault = false;

document.body.addEventListener("click", function initAudio() {
  gPiano.audio.resume();
  document.body.removeEventListener("click", initAudio);
  console.log("audio context resumed");
});

const activeKeys = {};
