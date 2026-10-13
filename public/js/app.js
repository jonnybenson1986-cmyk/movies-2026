/* StreamBox bootstrap — load full app from known-good commit via jsDelivr */
(function(){
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/jonnybenson1986-cmyk/movies-2026@abaf3105b8ea2813ea9862501302ced41b411f97/public/js/app.js';
  s.onerror = function(){ console.error('Failed to load StreamBox core from CDN'); };
  document.head.appendChild(s);
})();
