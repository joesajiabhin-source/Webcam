const desktopSessionId = window.CAMLINK_SESSION_ID;
const pairState = document.getElementById("pair-state");
const streamState = document.getElementById("stream-state");
const liveFrame = document.getElementById("live-frame");

let frameRefreshInFlight = false;
const PREVIEW_FPS = 12;
const PREVIEW_INTERVAL_MS = Math.round(1000 / PREVIEW_FPS);

async function refreshPairingStatus() {
  try {
    const response = await fetch(`/status/${desktopSessionId}`, { cache: "no-store" });
    if (!response.ok) return;

    const status = await response.json();
    pairState.textContent = status.message;
    streamState.textContent = status.message;
    document.body.dataset.pairState = status.state;
  } catch (error) {
    pairState.textContent = "Connection check failed";
    streamState.textContent = "Connection check failed";
  }
}

refreshPairingStatus();
setInterval(refreshPairingStatus, 1000);

function refreshLiveFrame() {
  if (!liveFrame || frameRefreshInFlight) return;

  frameRefreshInFlight = true;
  const nextFrame = new Image();

  nextFrame.onload = () => {
    liveFrame.src = nextFrame.src;
    frameRefreshInFlight = false;
  };

  nextFrame.onerror = () => {
    frameRefreshInFlight = false;
  };

  nextFrame.src = `/latest/${desktopSessionId}.jpg?t=${Date.now()}`;
}

refreshLiveFrame();
setInterval(refreshLiveFrame, PREVIEW_INTERVAL_MS);


/* ── Display Size & Ratio Controls ─────────────────────────────── */
(function initDisplayControls() {
  const shell = document.getElementById("preview-shell");
  const ratioPresets = document.getElementById("ratio-presets");
  const sizePresets = document.getElementById("size-presets");
  const slider = document.getElementById("size-slider");
  const sliderValue = document.getElementById("slider-value");

  if (!shell || !ratioPresets || !sizePresets || !slider || !sliderValue) return;

  /* ── helpers ── */
  function setActiveBtn(container, activeBtn) {
    container.querySelectorAll(".preset-btn").forEach(btn => btn.classList.remove("active"));
    activeBtn.classList.add("active");
  }

  function updateSliderFill() {
    const min = Number(slider.min);
    const max = Number(slider.max);
    const val = Number(slider.value);
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.setProperty("--fill", pct + "%");
  }

  function applyWidth(px) {
    shell.style.width = px + "px";
    shell.style.maxWidth = "100%";
    slider.value = px;
    sliderValue.textContent = px + "px";
    updateSliderFill();
  }

  function applyFull() {
    shell.style.width = "";
    shell.style.maxWidth = "";
    slider.value = slider.max;
    sliderValue.textContent = "Full";
    updateSliderFill();
  }

  /* ── Ratio presets ── */
  ratioPresets.addEventListener("click", function (e) {
    const btn = e.target.closest(".preset-btn");
    if (!btn) return;
    setActiveBtn(ratioPresets, btn);
    shell.style.aspectRatio = btn.dataset.ratio;
  });

  /* ── Size presets ── */
  sizePresets.addEventListener("click", function (e) {
    const btn = e.target.closest(".preset-btn");
    if (!btn) return;
    setActiveBtn(sizePresets, btn);

    if (btn.dataset.size === "full") {
      applyFull();
    } else {
      applyWidth(Number(btn.dataset.size));
    }
  });

  /* ── Custom slider ── */
  slider.addEventListener("input", function () {
    const px = Number(slider.value);
    shell.style.width = px + "px";
    shell.style.maxWidth = "100%";
    sliderValue.textContent = px + "px";
    updateSliderFill();

    // Deselect size presets since user is using custom
    sizePresets.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
  });

  // Initialize slider fill on load
  updateSliderFill();
})();

