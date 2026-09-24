// Shared behaviour for the secondary pages: theme toggle + tiny DOM helper.
(function () {
  if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = 'light';
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('nima-theme', next); } catch (e) {}
  });

  // el('div', {class:'x', href:'#'}, child|string, ...) — text is always set via textContent.
  window.el = function (tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  };
})();
