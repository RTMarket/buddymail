(function () {
  function paint() {
    fetch("/api/standalone/social-library", { credentials: "include" })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok) return;
        (d.assets || []).forEach(function (a) {
          if (a.kind !== "video" || !a.posterUrl) return;
          document.querySelectorAll("p.truncate").forEach(function (p) {
            if ((p.textContent || "").trim() !== a.fileName) return;
            var card = p.closest("div.overflow-hidden");
            if (!card) return;
            var btn = card.querySelector("button");
            if (!btn) return;
            var existing = btn.querySelector("img[data-bss-video-poster]");
            if (existing) {
              if (existing.getAttribute("src") !== a.posterUrl) existing.setAttribute("src", a.posterUrl);
              return;
            }
            btn.innerHTML = "";
            var img = document.createElement("img");
            img.setAttribute("data-bss-video-poster", "1");
            img.src = a.posterUrl;
            img.alt = a.fileName;
            img.className = "h-28 w-full object-cover";
            btn.appendChild(img);
          });
        });
      })
      .catch(function () {});
  }
  paint();
  setInterval(paint, 2000);
})();
