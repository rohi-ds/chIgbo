/* chIgbo cursor: a precise dot plus a targeting reticle that trails behind,
   locks onto anything clickable and snaps shut on press. Only for fine
   pointers; touch devices keep their native behaviour. */
(function () {
  'use strict';
  var root = document.documentElement;
  var ring = document.querySelector('.cur-ring');
  var dot = document.querySelector('.cur-dot');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var enabled = false, raf = 0, seen = false;
  var mx = 0, my = 0;            // pointer
  var rx = 0, ry = 0;            // ring centre
  var rw = 34, rh = 34, tw = 34, th = 34, rr = 17, tr = 17;
  var target = null;
  var HOT = 'a,button,[role="button"],summary,label,select,.clickable,[data-word],[data-act]';
  var TEXT = 'input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea';

  function frame() {
    var k = calm.matches ? 1 : 0.2;
    var tx = mx, ty = my;
    if (target && target.isConnected) {
      var r = target.getBoundingClientRect();
      if (r.width && r.width < 420 && r.height < 130) {
        tx = r.left + r.width / 2; ty = r.top + r.height / 2;
        tw = r.width + 12; th = r.height + 12;
        tr = Math.min(parseFloat(getComputedStyle(target).borderRadius) || 10, th / 2) + 5;
      } else { tw = th = 52; tr = 26; }
    } else { tw = th = 34; tr = 17; }
    rx += (tx - rx) * k; ry += (ty - ry) * k;
    rw += (tw - rw) * k; rh += (th - rh) * k; rr += (tr - rr) * k;
    ring.style.transform = 'translate3d(' + (rx - rw / 2).toFixed(1) + 'px,' + (ry - rh / 2).toFixed(1) + 'px,0)';
    ring.style.width = rw.toFixed(1) + 'px';
    ring.style.height = rh.toFixed(1) + 'px';
    ring.style.borderRadius = rr.toFixed(1) + 'px';
    dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
    raf = requestAnimationFrame(frame);
  }

  function onMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    mx = e.clientX; my = e.clientY;
    if (!seen) { seen = true; rx = mx; ry = my; root.classList.add('cur-live'); }
    var el = e.target && e.target.closest ? e.target : null;
    var text = el && el.closest(TEXT);
    var hot = !text && el && el.closest(HOT);
    if (hot && (hot.disabled || hot.getAttribute('aria-disabled') === 'true')) hot = null;
    target = hot || null;
    root.classList.toggle('cur-hot', !!hot);
    root.classList.toggle('cur-text', !!text);
  }
  function onDown() { root.classList.add('cur-down'); }
  function onUp() { root.classList.remove('cur-down'); }
  function onLeave() { root.classList.remove('cur-live'); seen = false; }

  function start() {
    if (enabled || !fine.matches) return;
    enabled = true;
    root.classList.add('cur-on');
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (!enabled) return;
    enabled = false;
    cancelAnimationFrame(raf);
    root.classList.remove('cur-on', 'cur-live', 'cur-hot', 'cur-text', 'cur-down');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('mouseleave', onLeave);
    seen = false;
  }

  // <dialog> lives in the top layer, above everything else: move the cursor
  // elements into whichever dialog is open so they stay visible.
  function rehome() {
    var open = document.querySelector('dialog[open]');
    var home = open || document.body;
    if (ring.parentNode !== home) { home.appendChild(ring); home.appendChild(dot); }
  }

  window.ChiCursor = {
    set: function (on) { on ? start() : stop(); },
    rehome: rehome,
    supported: function () { return fine.matches; }
  };
})();
