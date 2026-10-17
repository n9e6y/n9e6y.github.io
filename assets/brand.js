// Shared behaviour for every page: theme toggle, logo, mobile menu, share button, scroll reveals.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  if (!root.dataset.theme) root.dataset.theme = 'light';

  // ---- Theme toggle ----
  var toggle = document.getElementById('theme-toggle');
  function syncToggle() {
    var label = toggle && toggle.querySelector('.label');
    if (label) label.textContent = root.dataset.theme === 'dark' ? 'Light' : 'Dark';
  }
  if (toggle) toggle.addEventListener('click', function () {
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('nima-theme', next); } catch (e) {}
    syncToggle();
  });
  syncToggle();

  // ---- Logo: NEY opens to N9E6Y on first load and on hover ----
  var ney = document.querySelector('.ney');
  var brand = ney && ney.closest('a');
  if (ney) {
    setTimeout(function () { ney.classList.add('open'); }, 300);
    setTimeout(function () { if (!brand.matches(':hover')) ney.classList.remove('open'); }, 2000);
    brand.addEventListener('mouseenter', function () { ney.classList.add('open'); });
    brand.addEventListener('mouseleave', function () { ney.classList.remove('open'); });
    brand.addEventListener('focus', function () { ney.classList.add('open'); });
    brand.addEventListener('blur', function () { ney.classList.remove('open'); });
  }

  // ---- Mobile menu ----
  var header = document.querySelector('header.site');
  var btn = document.querySelector('.menu-btn');
  if (header && btn) {
    var setOpen = function (open) {
      header.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Close' : 'Menu';
    };
    btn.addEventListener('click', function () { setOpen(!header.classList.contains('menu-open')); });
    header.querySelectorAll('.nav-links a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 720) setOpen(false); });
  }

  // ---- Table of contents: mark the section being read ----
  var tocLinks = document.querySelectorAll('nav.toc a[href^="#"]');
  if (tocLinks.length) {
    var spy = function () {
      var cur = tocLinks[0];
      tocLinks.forEach(function (a) {
        var sec = document.getElementById(a.getAttribute('href').slice(1));
        if (sec && sec.getBoundingClientRect().top < 160) cur = a;
      });
      tocLinks.forEach(function (a) { a.setAttribute('aria-current', a === cur ? 'true' : 'false'); });
    };
    window.addEventListener('scroll', spy, { passive: true });
    spy();
  }

  // ---- Share: system share sheet where there is one, otherwise copy the canonical link ----
  document.querySelectorAll('[data-share]').forEach(function (b) {
    var note = document.createElement('span');
    note.className = 'share-note';
    note.setAttribute('role', 'status');
    b.parentNode.insertBefore(note, b);
    var timer;
    var say = function (msg) {
      note.textContent = msg;
      note.classList.add('on');
      clearTimeout(timer);
      timer = setTimeout(function () { note.classList.remove('on'); }, 2000);
    };
    b.addEventListener('click', function () {
      var canon = document.querySelector('link[rel="canonical"]');
      var url = canon ? canon.href : location.href;
      var title = document.title;
      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { say('Link copied'); },
          function () { window.prompt('Copy this link', url); });
      } else {
        window.prompt('Copy this link', url);
      }
    });
  });

  // ---- Scroll reveals (once) ----
  var items = document.querySelectorAll('[data-reveal]');
  if (!window.IntersectionObserver || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    items.forEach(function (el) { io.observe(el); });
  }
})();
