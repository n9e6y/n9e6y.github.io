(function () {
  var ney = document.querySelector('.ney');
  if (ney) setInterval(function () { ney.classList.toggle('open'); }, 5000);

  var header = document.querySelector('header');
  var btn = document.querySelector('.menu-btn');
  if (!header || !btn) return;
  function setOpen(open) {
    header.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () { setOpen(!header.classList.contains('menu-open')); });
  header.querySelectorAll('.nav-links a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 720) setOpen(false); });
})();
