// App Links / OAuth handoff. External on purpose: production CSP is
// script-src 'self' (no 'unsafe-inline'), so the previous inline copy was blocked
// and Android never received the intent.
(function () {
  var PKG = 'com.ftjdfr.travelexpensecompact';
  var HOST = location.host;
  var params = new URLSearchParams((location.search || '').replace(/^\?/, ''));
  var hash = (location.hash || '').replace(/^#/, '');
  if (hash) {
    new URLSearchParams(hash).forEach(function (value, key) {
      if (!params.has(key)) params.set(key, value);
    });
  }
  var extras = '';
  var qs = '';
  params.forEach(function (value, key) {
    // Native extras for new handlers; query retained for compatibility.
    extras += ';S.' + encodeURIComponent(key) + '=' + encodeURIComponent(value);
    qs += (qs ? '&' : '') + encodeURIComponent(key) + '=' + encodeURIComponent(value);
  });
  var appUrl = 'intent://' + HOST + '/android-auth' + (qs ? '?' + qs : '') +
    '#Intent;scheme=https;package=' + PKG + extras + ';end';
  var open = document.getElementById('open');
  if (open) open.setAttribute('href', appUrl);
  // Scrub the browser address bar immediately — tokens must not stay in history.
  try {
    history.replaceState(null, '', location.pathname);
  } catch (e) { /* ignore */ }
  try { window.location.href = appUrl; } catch (e) { /* manual button remains */ }
})();
