// Small network canvases in the hero's language: <canvas data-graph="drift"> (404, nodes drifting
// apart and regrouping) and <canvas data-graph="wander"> (empty states, slow wander).
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('canvas[data-graph]').forEach(function (cv) {
    var drift = cv.dataset.graph === 'drift';
    var N = drift ? 110 : 28, reach = drift ? 110 : 90;
    var ctx = cv.getContext('2d'), W = 0, H = 0, nodes = [], running = false;

    function make() {
      nodes = [];
      for (var i = 0; i < N; i++) {
        if (drift) {
          var x = 0.5 + (Math.random() - 0.5) * 0.08, y = 0.5 + (Math.random() - 0.5) * 0.08;
          var a = Math.atan2(y - 0.5, x - 0.5) + (Math.random() - 0.5) * 0.6, s = 0.0006 + Math.random() * 0.0012;
          nodes.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
        } else {
          nodes.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.0012, vy: (Math.random() - 0.5) * 0.0012 });
        }
      }
    }

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function step() {
      nodes.forEach(function (n) {
        n.x += n.vx; n.y += n.vy;
        if (!drift) {
          if (n.x < 0 || n.x > 1) n.vx = -n.vx;
          if (n.y < 0 || n.y > 1) n.vy = -n.vy;
        }
      });
      if (drift && nodes.every(function (n) { return n.x < -0.1 || n.x > 1.1 || n.y < -0.1 || n.y > 1.1; })) make();
    }

    function draw() {
      var rgb = getComputedStyle(document.documentElement).getPropertyValue('--ink-rgb').trim() || '13,13,13';
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j], dx = (a.x - b.x) * W, dy = (a.y - b.y) * H;
          if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < reach) {
            ctx.strokeStyle = 'rgba(' + rgb + ',' + ((1 - d / reach) * 0.32) + ')';
            ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H); ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(' + rgb + ',0.7)';
        ctx.beginPath(); ctx.arc(a.x * W, a.y * H, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }

    function frame() {
      if (!running) return;
      step(); draw();
      requestAnimationFrame(frame);
    }
    function start() { if (!running && !reduce && !document.hidden) { running = true; requestAnimationFrame(frame); } }
    function stop() { running = false; }

    make();
    // Reduced motion: one still frame, mid-drift so the 404 still reads as "wandered off".
    if (reduce && drift) for (var k = 0; k < 160; k++) step();
    size(); draw();

    if (window.ResizeObserver) new ResizeObserver(function () { size(); draw(); }).observe(cv);
    new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (e) { e[0].isIntersecting ? start() : stop(); }).observe(cv);
    } else start();
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  });
})();
