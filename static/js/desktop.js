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
