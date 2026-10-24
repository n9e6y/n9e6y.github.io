// Figures: draws an SVG chart from the <table> inside each <figure class="fig" data-chart="...">.
// The table stays as the accessible "Data" view and is the source for Copy CSV.
// Options go in data-opts as JSON. Chart kinds: bars, hbar, split, stack, multiples, dumbbell, line, heatmap.
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Helpers ----
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null) return;
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(n);
    return n;
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function num(s) { var v = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return isNaN(v) ? 0 : v; }
  function max(a) { return Math.max.apply(null, a); }
  function min(a) { return Math.min.apply(null, a); }
  function scale(d0, d1, a, b) { return function (v) { return a + (v - d0) / (d1 - d0) * (b - a); }; }
  function path(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + r1(p[0]) + ',' + r1(p[1]); }).join(''); }
  function fmt(v, o) { o = o || {}; return (o.pre || '') + (o.dp != null ? v.toFixed(o.dp) : String(+v.toFixed(2))) + (o.suf || ''); }

  // Round tick values covering [lo, hi].
  function ticks(lo, hi, n) {
    var raw = (hi - lo) / (n || 4) || 1, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    var st = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p, out = [];
    for (var v = Math.floor(lo / st) * st; v <= Math.ceil(hi / st) * st + st * 1e-6; v += st) out.push(+v.toFixed(6));
    return out;
  }

  function text(p, x, y, t, o) {
    o = o || {};
    var cls = (o.ink ? 'ink ' : '') + (o.halo ? 'halo ' : '') + (o.fix ? 'static' : '');
    return el('text', {
      x: r1(x), y: r1(y), text: t, 'text-anchor': o.anchor || null, class: cls.trim() || null,
      'font-weight': o.bold ? 600 : null, 'font-size': o.size || null
    }, p);
  }
  function grid(svg, tk, y, x0, x1, o) {
    tk.forEach(function (v, i) {
      el('line', { x1: x0, x2: x1, y1: y(v), y2: y(v), class: 'static', style: 'stroke:var(' + (i ? '--line' : '--line2') + ')' }, svg);
      text(svg, x0 - 8, y(v) + 4, fmt(v, o), { anchor: 'end', fix: 1 });
    });
  }
  // Annotation: thin leader line + short mono note.
  function annotate(p, x, y, t, o) {
    o = o || {};
    var dy = o.dy || -24;
    el('line', { x1: x, y1: y - 4, x2: x, y2: y + dy, style: 'stroke:var(--ink)' }, p);
    text(p, x, y + dy - 6, t, { ink: 1, halo: 1, anchor: o.anchor || 'middle' });
  }

  function readTable(t) {
    var cells = function (tr) { return [].map.call(tr.children, function (c) { return c.textContent.trim(); }); };
    return {
      head: cells(t.querySelector('thead tr')),
      rows: [].map.call(t.querySelectorAll('tbody tr'), cells)
    };
  }

  // One tooltip per figure; every data point is focusable and labelled.
  function tipper(fig) {
    var body = fig.querySelector('.fig-body'), tip = document.createElement('div');
    tip.className = 'fig-tip'; tip.hidden = true; tip.setAttribute('aria-hidden', 'true');
    body.appendChild(tip);
    return {
      show: function (node, t) {
        var b = body.getBoundingClientRect(), r = node.getBoundingClientRect();
        tip.textContent = t; tip.hidden = false;
        tip.style.left = (r.left + r.width / 2 - b.left) + 'px';
        tip.style.top = (r.top - b.top) + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }
  function point(node, label, tip, cb) {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', label);
    var on = function () { tip.show(node, label); if (cb) cb(true); };
    var off = function () { tip.hide(); if (cb) cb(false); };
    node.addEventListener('mouseenter', on); node.addEventListener('focus', on);
    node.addEventListener('mouseleave', off); node.addEventListener('blur', off);
  }

  // ---- Charts. Each returns the draw-in direction ('up' for bars). Labels and axes get fix: 1 / class 'static' so only the data wipes in. ----
  var CHARTS = {};

  // Vertical bars (histograms, values over a category). hi: [from, to] indices drawn in ink.
  CHARTS.bars = function (svg, d, o, tip) {
    var W = o.w || 680, H = o.h || 300, m = { l: 48, r: 16, t: 28, b: 40 };
    var vals = d.rows.map(function (r) { return num(r[1]); }), n = vals.length;
    var tk = ticks(0, max(vals), 3), y = scale(0, tk[tk.length - 1], H - m.b, m.t), bw = (W - m.l - m.r) / n;
    var hi = o.hi || [-1, -1], every = o.every || Math.ceil(n / 7);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    grid(svg, tk, y, m.l, W - m.r, o.y);
    vals.forEach(function (v, i) {
      var on = i >= hi[0] && i <= hi[1];
      var r = el('rect', { x: r1(m.l + i * bw + 1), y: r1(y(v)), width: r1(Math.max(1, bw - 2)), height: r1(y(0) - y(v)), style: 'fill:var(' + (on ? '--ink' : '--g4') + ')' }, svg);
      point(r, d.rows[i][0] + ' · ' + d.rows[i][1], tip);
      if (i % every === 0) text(svg, m.l + i * bw + bw / 2, H - m.b + 20, d.rows[i][0], { anchor: 'middle', fix: 1 });
    });
    if (o.vline) {
      var vx = m.l + o.vline.at * bw;
      el('line', { x1: vx, x2: vx, y1: m.t, y2: H - m.b, style: 'stroke:var(--ink);stroke-dasharray:3 3' }, svg);
      text(svg, vx + 6, m.t + 12, o.vline.text, { ink: 1, halo: 1 });
    }
    if (o.note) annotate(svg, m.l + o.note.i * bw + bw / 2, y(vals[o.note.i]), o.note.text, o.note);
    return 'up';
  };

  // Ranked horizontal bars: sorted, one bar in ink (o.focus, default the top one), values at the tips.
  // Drawn at the container's width, like split.
  CHARTS.hbar = function (svg, d, o, tip) {
    var W = o.w || Math.max(300, Math.round(svg.parentNode.clientWidth) || 680), rowH = 36, m = { l: o.left || 150, r: 72, t: 4 };
    var rows = d.rows.slice().sort(function (a, b) { return num(b[1]) - num(a[1]); });
    var H = m.t + rows.length * rowH + 4, x = scale(0, num(rows[0][1]), m.l, W - m.r);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    el('line', { x1: m.l, x2: m.l, y1: 0, y2: H, class: 'static', style: 'stroke:var(--line2)' }, svg);
    rows.forEach(function (r, i) {
      var v = num(r[1]), yy = m.t + i * rowH, on = o.focus ? r[0] === o.focus : i === 0;
      text(svg, m.l - 12, yy + rowH / 2 + 4, r[0], { anchor: 'end', ink: on, fix: 1 });
      var b = el('rect', { x: m.l, y: yy + 8, width: r1(x(v) - m.l), height: rowH - 16, style: 'fill:var(' + (on ? '--ink' : '--g4') + ')' }, svg);
      text(svg, x(v) + 8, yy + rowH / 2 + 4, r[1], { ink: on, bold: on });
      point(b, r[0] + ' · ' + r[1], tip);
    });
  };

  // Part-to-whole: one bar split into its rows, labels above, total below. o.focus names the part drawn in ink.
  // Drawn at the container's width so the labels stay legible; below 560px each label gets its own line.
  // o.share: the values already are percentages, so labels show them once and the total reads 100%.
  CHARTS.split = function (svg, d, o, tip) {
    var W = o.w || Math.max(300, Math.round(svg.parentNode.clientWidth) || 680), stack = W < 560;
    var vals = d.rows.map(function (r) { return num(r[1]); }), top = stack ? vals.length * 20 + 8 : 28, H = top + 76;
    var total = vals.reduce(function (a, b) { return a + b; }, 0), x = scale(0, total, 0, W), at = 0;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    vals.forEach(function (v, i) {
      var r = d.rows[i], on = r[0] === o.focus, last = i === vals.length - 1, gap = last ? 0 : 2;
      var pct = o.share ? r[1] + '%' : fmt(v / total * 100, { dp: 1, suf: '%' });
      var label = o.share ? r[0] + ' · ' + pct : r[0] + ' · ' + r[1] + ' · ' + pct;
      var b = el('rect', { x: r1(x(at)), y: top, width: r1(Math.max(1, x(v) - gap)), height: 48, style: 'fill:var(' + (on ? '--ink' : '--g4') + ')' }, svg);
      text(svg, last ? W : x(at), stack ? 16 + i * 20 : 16, label, { anchor: last ? 'end' : null, ink: on, bold: on, fix: 1 });
      point(b, label, tip);
      at += v;
    });
    text(svg, 0, H - 6, '0', { size: 11, fix: 1 });
    text(svg, W, H - 6, o.share ? '100%' : total.toLocaleString('en-US'), { anchor: 'end', size: 11, fix: 1 });
  };

  // 100% stacked bars: one bar per row, one segment per column, shaded down the gray ramp from ink.
  // Legend on top, values inside segments wide enough to hold them (and not below o.min). Drawn at the container's width, like split.
  // o.n: use only the first n value columns (later columns, e.g. notes, stay in the Data table). Zero segments are skipped.
  CHARTS.stack = function (svg, d, o, tip) {
    var W = o.w || Math.max(300, Math.round(svg.parentNode.clientWidth) || 680), m = { l: o.left || 96 };
    var end = o.n ? o.n + 1 : undefined, parts = d.head.slice(1, end), ramp = ['--ink', '--g7', '--g5', '--g3', '--g2'], CH = 7.3, rowH = 50, barH = 36;
    // Legend: swatch + name, wrapping onto new lines at the right edge.
    var lx = m.l, ly = 0;
    parts.forEach(function (p, k) {
      var w = 16 + p.length * CH + 20;
      if (lx + w > W && lx > m.l) { lx = m.l; ly += 20; }
      el('rect', { x: lx, y: ly + 3, width: 10, height: 10, class: 'static', style: 'fill:var(' + ramp[k % ramp.length] + ')' }, svg);
      text(svg, lx + 16, ly + 12, p, { fix: 1 });
      lx += w;
    });
    var top = ly + 32, H = top + d.rows.length * rowH - (rowH - barH);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    d.rows.forEach(function (r, i) {
      var vals = r.slice(1, end).map(num), total = vals.reduce(function (a, b) { return a + b; }, 0);
      var yy = top + i * rowH, x = scale(0, total, m.l, W), at = 0;
      text(svg, 0, yy + barH / 2 + 4, r[0], { ink: 1, size: 13, fix: 1 });
      vals.forEach(function (v, k) {
        if (!v) return;
        var x0 = x(at), w = x(at + v) - x0, last = k === vals.length - 1, f = ramp[k % ramp.length];
        var seg = el('rect', { x: r1(x0), y: yy, width: r1(Math.max(1, w - (last ? 0 : 2))), height: barH, style: 'fill:var(' + f + ')' }, svg);
        var label = r[k + 1].replace(/^0\./, '.');
        if (w >= label.length * CH + 12 && !(v < o.min)) {
          el('text', { x: r1(x0 + 7), y: yy + barH / 2 + 4, text: label, style: 'fill:var(' + (k < 3 ? '--paper' : '--ink') + ')' }, svg);
        }
        point(seg, r[0] + ' · ' + parts[k] + ' ' + label, tip);
        at += v;
      });
    });
  };

  // Small multiples: one panel of horizontal bars per value column, on one shared scale, rows in table order.
  // o.focus names the row drawn in ink. A value starting with "~" is an estimate: drawn as a dashed outline.
  // Drawn at the container's width; panels sit side by side from 560px, stacked below that. o.n: use only the first n value columns.
  CHARTS.multiples = function (svg, d, o, tip) {
    var W = o.w || Math.max(300, Math.round(svg.parentNode.clientWidth) || 680), CH = 7.3, gap = 40, rowH = 52, barH = 18;
    var end = o.n ? o.n + 1 : undefined, panels = d.head.slice(1, end), side = W >= 560, pw = side ? (W - gap * (panels.length - 1)) / panels.length : W;
    var all = [], room = 0;
    d.rows.forEach(function (r) { r.slice(1, end).forEach(function (v) { all.push(num(v)); room = Math.max(room, v.length * CH + 10); }); });
    var x = scale(0, max(all), 0, pw - room), panelH = 28 + d.rows.length * rowH;
    var H = side ? panelH : panels.length * (panelH + 24) - 24;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    panels.forEach(function (p, k) {
      var x0 = side ? k * (pw + gap) : 0, y0 = side ? 0 : k * (panelH + 24);
      text(svg, x0, y0 + 14, p, { ink: 1, bold: 1, size: 13, fix: 1 });
      el('line', { x1: x0, x2: x0, y1: y0 + 26, y2: y0 + panelH, class: 'static', style: 'stroke:var(--line2)' }, svg);
      d.rows.forEach(function (r, i) {
        var v = r[k + 1], on = r[0] === o.focus, est = /^~/.test(v), yy = y0 + 28 + i * rowH, w = Math.max(1, x(num(v)));
        text(svg, x0 + 8, yy + 16, r[0], { ink: on, fix: 1 });
        var b = el('rect', { x: x0, y: yy + 24, width: r1(w), height: barH, style: est
          ? 'fill:none;stroke:var(--g5);stroke-dasharray:4 3' : 'fill:var(' + (on ? '--ink' : '--g4') + ')' }, svg);
        text(svg, x0 + w + 8, yy + 24 + barH / 2 + 4, v, { ink: on, bold: on });
        point(b, p + ' · ' + r[0] + ' · ' + v, tip);
      });
    });
  };

  // Before/after dumbbell. Columns: label, before, after. The row with the biggest ratio gets Signal.
  CHARTS.dumbbell = function (svg, d, o, tip) {
    var W = o.w || 960, rowH = 56, m = { l: 200, r: 120, t: 48 }, n = d.rows.length, H = m.t + n * rowH + 24;
    var vals = d.rows.map(function (r) { return [num(r[1]), num(r[2])]; });
    var tk = ticks(0, max([].concat.apply([], vals)), 6), x = scale(0, tk[tk.length - 1], m.l, W - m.r);
    var ratios = vals.map(function (v) { return v[0] / v[1]; }), best = ratios.indexOf(max(ratios));
    var suf = o.unit ? ' ' + o.unit : '';
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    text(svg, x(vals[0][1]), 24, d.head[2], { anchor: 'middle', ink: 1, fix: 1 });
    text(svg, x(vals[0][0]), 24, d.head[1], { anchor: 'middle', fix: 1 });
    text(svg, W - 20, 24, o.ratio || 'ratio', { anchor: 'end', fix: 1 });
    el('line', { x1: m.l, x2: m.l, y1: m.t - 28, y2: H - 32, class: 'static', style: 'stroke:var(--line2)' }, svg);
    vals.forEach(function (v, i) {
      var yy = m.t + i * rowH, xa = x(v[1]), xb = x(v[0]);
      el('line', { x1: 0, x2: W, y1: yy + 28, y2: yy + 28, class: 'static', style: 'stroke:var(--line)' }, svg);
      el('line', { x1: xa, x2: xb, y1: yy, y2: yy, style: 'stroke:var(--g3);stroke-width:3' }, svg);
      el('circle', { cx: r1(xb), cy: yy, r: 7, style: 'fill:var(--paper);stroke:var(--g5);stroke-width:2' }, svg);
      var a = el('circle', { cx: r1(xa), cy: yy, r: 7, style: 'fill:var(' + (i === best ? '--signal' : '--ink') + ')' }, svg);
      text(svg, 0, yy + 4, d.rows[i][0], { ink: 1, size: 13, fix: 1 });
      text(svg, xa - 14, yy + 4, fmt(v[1], { dp: 2, suf: suf }), { anchor: 'end', ink: 1 });
      text(svg, xb + 14, yy + 4, fmt(v[0], { dp: 2, suf: suf }));
      text(svg, W - 20, yy + 4, fmt(ratios[i], { dp: 1, suf: '×' }), { anchor: 'end', ink: 1, bold: i === best });
      point(a, d.rows[i][0] + ' · ' + d.head[1] + ' ' + d.rows[i][1] + ' → ' + d.head[2] + ' ' + d.rows[i][2], tip);
    });
    tk.forEach(function (t) { text(svg, x(t), H - 10, fmt(t, { suf: suf }), { anchor: 'middle', fix: 1 }); });
  };

  // Lines with end labels and a hover/focus crosshair. o.focus names the series drawn in ink.
  CHARTS.line = function (svg, d, o, tip) {
    var W = o.w || 960, H = o.h || 340, m = { l: 48, r: 210, t: 20, b: 48 };
    var series = d.head.slice(1), n = d.rows.length, all = [];
    d.rows.forEach(function (r) { r.slice(1).forEach(function (v) { all.push(num(v)); }); });
    var tk = ticks(o.min != null ? o.min : min(all), o.max != null ? o.max : max(all), 5);
    var y = scale(tk[0], tk[tk.length - 1], H - m.b, m.t);
    var x = function (i) { return m.l + i / (n - 1) * (W - m.l - m.r); };
    var focus = o.focus || series[series.length - 1];
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    grid(svg, tk, y, m.l, W - m.r, o.y);
    d.rows.forEach(function (r, i) { text(svg, x(i), H - m.b + 22, r[0], { anchor: 'middle', fix: 1 }); });
    if (o.xTitle) text(svg, m.l, H - 4, o.xTitle, { size: 11, fix: 1 });
    var cross = el('line', { y1: m.t, y2: H - m.b, style: 'stroke:var(--line2)', visibility: 'hidden' }, svg);
    series.forEach(function (s, k) {
      var on = s === focus, pts = d.rows.map(function (r, i) { return [x(i), y(num(r[k + 1]))]; }), end = pts[pts.length - 1];
      el('path', { d: path(pts), style: 'fill:none;stroke:var(' + (on ? '--ink' : '--g5') + ');stroke-width:' + (on ? '2.5' : '2;stroke-dasharray:6 4') }, svg);
      pts.forEach(function (p) {
        el('circle', { cx: r1(p[0]), cy: r1(p[1]), r: on ? 4 : 3.5, style: on ? 'fill:var(--ink)' : 'fill:var(--paper);stroke:var(--g5);stroke-width:1.5' }, svg);
      });
      text(svg, end[0] + 12, end[1] + 4, s + ' ' + d.rows[n - 1][k + 1], { ink: on, bold: on });
    });
    if (o.note) {
      var fk = series.indexOf(focus) + 1;
      annotate(svg, x(o.note.i), y(num(d.rows[o.note.i][fk])), o.note.text, o.note);
    }
    var colW = (W - m.l - m.r) / (n - 1);
    d.rows.forEach(function (r, i) {
      var band = el('rect', { x: r1(x(i) - colW / 2), y: m.t, width: r1(colW), height: H - m.b - m.t, style: 'fill:transparent' }, svg);
      var label = d.head[0] + ' ' + r[0] + ' · ' + series.map(function (s, k) { return s + ' ' + r[k + 1]; }).join(' · ');
      point(band, label, tip, function (show) {
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
        cross.setAttribute('visibility', show ? 'visible' : 'hidden');
      });
    });
  };

  // Cell grid on the gray ramp: one row per series, values 0..1. o.focus row is drawn in ink.
  // o.n: use only the first n value columns. o.cols: column names above the cells. o.of: the total reads "sum/n", not a percentage.
  CHARTS.heatmap = function (svg, d, o, tip) {
    var n = o.n || d.rows[0].length - 1, cw = o.cell || 10.5, ch = o.cellH || 24, gap = 6, m = { l: o.left || 130, r: 110, t: o.cols ? 22 : 0 };
    var W = m.l + n * cw + m.r, H = m.t + d.rows.length * (ch + gap);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    if (o.cols) d.head.slice(1, n + 1).forEach(function (c, ci) { text(svg, m.l + ci * cw + (cw - 1) / 2, 12, c, { anchor: 'middle', size: 11, fix: 1 }); });
    d.rows.forEach(function (r, ri) {
      var on = r[0] === o.focus, yy = m.t + ri * (ch + gap), sum = 0;
      var row = el('g', {}, svg);
      r.slice(1, n + 1).forEach(function (s, ci) {
        var v = Math.max(0, Math.min(1, num(s))), f;
        sum += v;
        if (v >= 1) f = on ? '--ink' : '--g7';
        else f = '--g' + Math.max(1, Math.round(v * 8) + 1);
        el('rect', { x: r1(m.l + ci * cw), y: yy, width: r1(cw - 1), height: ch, style: 'fill:var(' + f + ')' }, row);
      });
      var total = o.of ? fmt(sum, { dp: 0 }) + '/' + n : fmt(sum / n * 100, { dp: 0, suf: o.suf || '%' });
      text(svg, o.left ? 0 : m.l - 10, yy + ch / 2 + 4, r[0], { anchor: o.left ? null : 'end', ink: on, bold: on, fix: 1 });
      text(svg, m.l + n * cw + 10, yy + ch / 2 + 4, total, { ink: on, bold: on });
      point(row, r[0] + ' · ' + total, tip);
    });
  };

  // ---- Figure wiring: Data toggle + Copy CSV ----
  function csv(table) {
    var q = function (v) { return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [].map.call(table.querySelectorAll('tr'), function (tr) {
      return [].map.call(tr.children, function (c) { return q(c.textContent.trim()); }).join(',');
    }).join('\n');
  }
  function tools(fig, table) {
    var bar = fig.querySelector('.fig-tools');
    if (!bar) return;
    bar.innerHTML = '<button type="button" data-umami-event="fig-data" aria-pressed="false">Data</button>' +
                    '<button type="button" data-umami-event="fig-copy-csv">Copy CSV</button>';
    var data = bar.children[0], copy = bar.children[1];
    data.addEventListener('click', function () {
      var on = fig.classList.toggle('show-data');
      data.setAttribute('aria-pressed', String(on));
    });
    copy.addEventListener('click', function () {
      var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy CSV'; }, 1400); };
      try { navigator.clipboard.writeText(csv(table)).then(done, function () {}); } catch (e) {}
    });
  }

  document.querySelectorAll('figure.fig[data-chart]').forEach(function (fig) {
    var draw = CHARTS[fig.dataset.chart], table = fig.querySelector('table.fig-data'), host = fig.querySelector('.fig-chart');
    if (!draw || !table || !host) return;
    var o = {};
    try { o = JSON.parse(fig.dataset.opts || '{}'); } catch (e) {}
    var h = fig.querySelector('.h3');
    var svg = el('svg', { role: 'group', 'aria-label': h ? h.textContent : null }, host);
    if (o.minW) svg.style.minWidth = o.minW + 'px';
    var dir = draw(svg, readTable(table), o, tipper(fig));
    // Data marks move into one group that wipes in; axes and labels (class "static") stay put underneath.
    var marks = el('g', { class: 'draw' + (dir === 'up' ? ' up' : '') });
    [].slice.call(svg.childNodes).forEach(function (n) {
      if (!(n.classList && n.classList.contains('static'))) marks.appendChild(n);
    });
    svg.appendChild(marks);
    tools(fig, table);
  });

  // ---- Inline sparklines: <svg class="spark" width="72" height="18" data-values="1,2,3"> ----
  document.querySelectorAll('svg.spark[data-values]').forEach(function (s) {
    var v = s.dataset.values.split(',').map(Number), w = +s.getAttribute('width') || 72, h = +s.getAttribute('height') || 18;
    var lo = min(v), hi = max(v);
    var p = v.map(function (x, i) { return [1 + i / (v.length - 1) * (w - 4), h - 2 - (x - lo) / (hi - lo || 1) * (h - 4)]; });
    var e = p[p.length - 1];
    s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    el('path', { d: path(p), style: 'fill:none;stroke:var(--g5);stroke-width:1.25' }, s);
    el('circle', { cx: r1(e[0]), cy: r1(e[1]), r: 2.2, style: 'fill:var(--ink)' }, s);
  });

  // ---- Draw in once when scrolled into view ----
  var figs = document.querySelectorAll('figure.fig');
  if (reduce || !window.IntersectionObserver) {
    figs.forEach(function (f) { f.classList.add('drawn'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('drawn'); io.unobserve(e.target); } });
    }, { threshold: 0.25 });
    figs.forEach(function (f) { io.observe(f); });
  }
})();
