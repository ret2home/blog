(() => {
  let loading = false;

  const renderMath = () => {
    if (!document.querySelector(".arithmatex")) return;

    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
      return;
    }
    if (loading) return;
    loading = true;

    window.MathJax = {
      tex: {
        inlineMath: [["\\(", "\\)"]],
        displayMath: [["\\[", "\\]"]]
      },
      options: {
        ignoreHtmlClass: ".*",
        processHtmlClass: "arithmatex"
      }
    };

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
    document.head.appendChild(script);
  };

  if (typeof document$ !== "undefined") {
    document$.subscribe(renderMath);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderMath, { once: true });
  } else {
    renderMath();
  }
})();
