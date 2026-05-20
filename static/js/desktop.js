const desktopSessionId = window.CAMLINK_SESSION_ID;
const pairState = document.getElementById("pair-state");
const streamState = document.getElementById("stream-state");

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
