/*
 * app.js -- the controls.
 *
 * Three pieces of interface:
 *   the stage             drag an entity to move it, tap it to take it off
 *   the mixer, on the right   five bars per lighting system, interconnected
 *   the switches          which lighting systems are on the rig at all
 */
(function (root) {
  'use strict';

  var Color = root.SLS.Color, Light = root.SLS.Light,
      Entities = root.SLS.Entities, StageView = root.SLS.Stage;

  var lights = Light.createRig();
  var entities = [];
  var stage = null;
  var els = {};
  var nextId = 1;
  var cards = {};

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ------------------------------------------------------------ drawing */

  var frame = 0;
  function draw() {
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      stage.render();
    });
  }

  /* -------------------------------------------------------- the mixer */

  function bar(opts) {
    var row = el('div', 'bar');
    var lab = el('span', 'bar__label', opts.label);
    var input = el('input', 'bar__range ' + opts.cls);
    input.type = 'range';
    input.min = opts.min; input.max = opts.max; input.step = opts.step || 1;
    input.value = opts.value;
    input.id = opts.id;
    input.setAttribute('aria-label', opts.aria || opts.label);
    var out = el('span', 'bar__value');
    row.appendChild(lab); row.appendChild(input); row.appendChild(out);
    input.addEventListener('input', function () { opts.onInput(Number(input.value)); });
    return {
      el: row, input: input,
      set: function (v, text) { input.value = v; out.textContent = text; },
      setText: function (text) { out.textContent = text; },
      setTrack: function (css) { input.style.background = css; }
    };
  }

  /**
   * One lighting system's five bars.
   *
   * Red, green and blue set the channels directly. The mixer underneath them
   * is the same colour seen as one hue, so moving it swings all three channels
   * together and moving any channel slides the mixer to wherever that mix
   * landed. Brightness is separate: it scales this lamp only, not the stage.
   */
  function buildCard(light) {
    var card = el('section', 'card');
    card.setAttribute('aria-label', light.label);

    var head = el('header', 'card__head');
    var swatch = el('span', 'card__swatch');
    head.appendChild(swatch);
    head.appendChild(el('h2', 'card__title', light.label));
    var hex = el('span', 'card__hex');
    head.appendChild(hex);
    card.appendChild(head);

    var bars = {};

    function pushChannel(key, name, cls) {
      bars[key] = bar({
        label: name.charAt(0), aria: light.label + ' ' + name, cls: cls,
        id: light.id + '-' + key, min: 0, max: 255, value: light[key],
        onInput: function (v) {
          light[key] = v;
          syncFromChannels();
          changed();
        }
      });
      card.appendChild(bars[key].el);
    }
    pushChannel('r', 'Red', 'bar__range--r');
    pushChannel('g', 'Green', 'bar__range--g');
    pushChannel('b', 'Blue', 'bar__range--b');

    bars.hue = bar({
      label: 'Mix', aria: light.label + ' colour mixer', cls: 'bar__range--hue',
      id: light.id + '-hue', min: 0, max: 359, value: 0,
      onInput: function (h) {
        var hsv = Color.rgbToHsv(light.r, light.g, light.b);
        /* a grey or a black has no hue to swing, so give the mixer something
         * to work with rather than have it do nothing */
        var s = hsv.s < 0.06 ? 1 : hsv.s;
        var v = hsv.v < 0.06 ? 1 : hsv.v;
        var rgb = Color.hsvToRgb(h, s, v);
        light.r = rgb.r; light.g = rgb.g; light.b = rgb.b;
        syncFromMixer();
        changed();
      }
    });
    card.appendChild(bars.hue.el);

    bars.brightness = bar({
      label: 'Lvl', aria: light.label + ' brightness', cls: 'bar__range--level',
      id: light.id + '-level', min: 0, max: 150, value: Math.round(light.brightness * 100),
      onInput: function (v) {
        light.brightness = v / 100;
        bars.brightness.setText(v + '%');
        changed();
      }
    });
    card.appendChild(bars.brightness.el);

    function paint() {
      var hexStr = Color.rgbToHex(light.r, light.g, light.b);
      swatch.style.background = hexStr;
      hex.textContent = hexStr.toUpperCase();
      bars.r.setTrack('linear-gradient(90deg,#0c0c10,#ff3b30)');
      bars.g.setTrack('linear-gradient(90deg,#0c0c10,#34d05c)');
      bars.b.setTrack('linear-gradient(90deg,#0c0c10,#3d7bff)');
      bars.hue.setTrack('linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)');
      bars.brightness.setTrack('linear-gradient(90deg,#0c0c10,' + hexStr + ')');
      card.style.setProperty('--lamp', hexStr);
    }

    /* a channel moved: slide the mixer to the hue that mix landed on */
    function syncFromChannels() {
      bars.r.set(light.r, String(light.r));
      bars.g.set(light.g, String(light.g));
      bars.b.set(light.b, String(light.b));
      var h = Color.rgbToHsv(light.r, light.g, light.b).h;
      bars.hue.set(Math.round(h), Math.round(h) + '°');
      paint();
    }

    /* the mixer moved: move all three channels to match */
    function syncFromMixer() {
      bars.r.set(light.r, String(light.r));
      bars.g.set(light.g, String(light.g));
      bars.b.set(light.b, String(light.b));
      bars.hue.setText(bars.hue.input.value + '°');
      paint();
    }

    syncFromChannels();
    bars.brightness.setText(Math.round(light.brightness * 100) + '%');

    return { el: card, sync: syncFromChannels };
  }

  function changed() {
    stage.lightsChanged();
    draw();
  }

  function renderMixer() {
    var host = els.mixer;
    host.textContent = '';
    cards = {};
    var any = false;
    for (var i = 0; i < lights.length; i++) {
      if (!lights[i].enabled) continue;
      any = true;
      var c = buildCard(lights[i]);
      cards[lights[i].id] = c;
      host.appendChild(c.el);
    }
    if (!any) {
      var empty = el('p', 'mixer__empty',
        'No lighting systems on the rig. Turn one on in stage settings.');
      host.appendChild(empty);
    }
  }

  /* ------------------------------------------------------- the switches */

  function renderSwitches() {
    var host = els.switches;
    host.textContent = '';
    lights.forEach(function (light) {
      var row = el('label', 'switch');
      var input = el('input');
      input.type = 'checkbox';
      input.checked = light.enabled;
      input.id = 'sw-' + light.id;
      input.addEventListener('change', function () {
        light.enabled = input.checked;
        row.classList.toggle('is-on', light.enabled);
        renderMixer();
        changed();
      });
      var dot = el('span', 'switch__dot');
      dot.style.background = Color.rgbToHex(light.r, light.g, light.b);
      row.appendChild(input);
      row.appendChild(dot);
      row.appendChild(el('span', 'switch__name', light.label));
      row.appendChild(el('span', 'switch__state'));
      row.classList.toggle('is-on', light.enabled);
      host.appendChild(row);
    });
  }

  /* -------------------------------------------------------- the entities */

  function renderPicker() {
    var host = els.picker;
    host.textContent = '';
    Entities.COLOURS.forEach(function (c) {
      var b = el('button', 'pick');
      b.type = 'button';
      b.title = 'Add a ' + c.name.toLowerCase() + ' one';
      b.setAttribute('aria-label', 'Add a ' + c.name.toLowerCase() + ' one');
      var thumb = Entities.thumbnail(c.hex, 54);
      thumb.className = 'pick__art';
      b.appendChild(thumb);
      b.appendChild(el('span', 'pick__name', c.name));
      b.addEventListener('click', function () { addEntity(c.hex); });
      host.appendChild(b);
    });
  }

  function addEntity(hex) {
    /* drop them into a free-ish spot rather than stacking on one another */
    var n = entities.length;
    var e = {
      id: 'E' + (nextId++),
      hex: hex,
      x: 0.18 + ((n * 0.17) % 0.66),
      y: StageView.FLOOR_Y + 0.12 + ((n % 3) * 0.11)
    };
    var c = stage.clamp(e.x, e.y);
    e.x = c.x; e.y = c.y;
    entities.push(e);
    stage.setEntities(entities);
    draw();
    announce('Added. Tap it on the stage to take it off.');
  }

  function removeEntity(e) {
    var i = entities.indexOf(e);
    if (i >= 0) entities.splice(i, 1);
    stage.setEntities(entities);
    draw();
  }

  /* drag to move, tap to take off */
  function wireStage() {
    var canvas = els.stage;
    var drag = null;

    canvas.addEventListener('pointerdown', function (evt) {
      var rect = canvas.getBoundingClientRect();
      var n = { x: (evt.clientX - rect.left) / rect.width,
                y: (evt.clientY - rect.top) / rect.height };
      var hit = stage.pick(n.x, n.y);
      if (!hit) return;
      evt.preventDefault();
      canvas.setPointerCapture(evt.pointerId);
      drag = { e: hit, moved: 0, dx: hit.x - n.x, dy: hit.y - n.y };
      canvas.classList.add('is-dragging');
    });

    canvas.addEventListener('pointermove', function (evt) {
      if (!drag) return;
      var rect = canvas.getBoundingClientRect();
      var nx = (evt.clientX - rect.left) / rect.width + drag.dx;
      var ny = (evt.clientY - rect.top) / rect.height + drag.dy;
      drag.moved += Math.abs(nx - drag.e.x) + Math.abs(ny - drag.e.y);
      var c = stage.clamp(nx, ny);
      drag.e.x = c.x; drag.e.y = c.y;
      stage.entitiesChanged();
      draw();
    });

    function end() {
      if (!drag) return;
      canvas.classList.remove('is-dragging');
      /* a tap, not a drag, means take it off the stage */
      if (drag.moved < 0.012) removeEntity(drag.e);
      drag = null;
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /* ----------------------------------------------------------- panels */

  function openPanel(panel, open) {
    var isOpen = open == null ? panel.hidden : open;
    /* close the other one, so they never overlap */
    [els.pickerPanel, els.settingsPanel].forEach(function (p) {
      if (p !== panel) { p.hidden = true; syncPanelButtons(); }
    });
    panel.hidden = !isOpen;
    syncPanelButtons();
  }

  function syncPanelButtons() {
    els.btnChars.setAttribute('aria-expanded', String(!els.pickerPanel.hidden));
    els.btnChars.classList.toggle('is-active', !els.pickerPanel.hidden);
    els.btnSettings.setAttribute('aria-expanded', String(!els.settingsPanel.hidden));
    els.btnSettings.classList.toggle('is-active', !els.settingsPanel.hidden);
    els.gear.setAttribute('aria-expanded', String(!els.settingsPanel.hidden));
    els.gear.classList.toggle('is-active', !els.settingsPanel.hidden);
  }

  var noteTimer = 0;
  function announce(msg) {
    els.note.textContent = msg;
    els.note.classList.add('is-on');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { els.note.classList.remove('is-on'); }, 2600);
  }

  /* ------------------------------------------------------------- boot */

  function boot() {
    els.stage = $('stage');
    els.mixer = $('mixer');
    els.switches = $('switches');
    els.picker = $('picker');
    els.pickerPanel = $('picker-panel');
    els.settingsPanel = $('settings-panel');
    els.btnChars = $('btn-chars');
    els.btnSettings = $('btn-settings');
    els.gear = $('gear');
    els.note = $('note');

    stage = StageView.create(els.stage);
    stage.setLights(lights);
    stage.setEntities(entities);

    renderMixer();
    renderSwitches();
    renderPicker();
    wireStage();

    els.btnChars.addEventListener('click', function () { openPanel(els.pickerPanel); });
    els.btnSettings.addEventListener('click', function () { openPanel(els.settingsPanel); });
    els.gear.addEventListener('click', function () { openPanel(els.settingsPanel); });
    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        openPanel(document.getElementById(b.getAttribute('data-close')), false);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        els.pickerPanel.hidden = true;
        els.settingsPanel.hidden = true;
        syncPanelButtons();
      }
    });

    /* open with a few on stage, in colours that behave differently under a
     * coloured lamp, so the first thing you see is the thing it does */
    ['#e02a2a', '#25a34c', '#2f5ad8', '#e8d21d'].forEach(function (hex) {
      addEntity(hex);
    });
    els.note.classList.remove('is-on');

    var resizeTimer = 0;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { stage.resize(); draw(); }, 90);
    }
    root.addEventListener('resize', onResize);
    if (typeof root.ResizeObserver === 'function') {
      new root.ResizeObserver(onResize).observe(els.stage);
    }

    draw();

    root.StageLights = {
      lights: lights, entities: entities,
      add: addEntity,
      /* anyone changing a lamp by hand expects this to take effect, so always
       * re-light rather than trusting a dirty flag they never set */
      render: function () { stage.lightsChanged(); stage.entitiesChanged(); draw(); },
      refreshControls: function () { renderMixer(); renderSwitches(); },
      Color: Color, Light: Light, Entities: Entities
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : this);
