const sessionId = window.CAMLINK_SESSION_ID;
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const statusEl = document.getElementById("status");
const switchButton = document.getElementById("switch");
const ctx = canvas.getContext("2d", { alpha: false });

let stream = null;
let facingMode = "environment";
let sending = false;
let stopped = false;
let streamTimer = null;
let uploadInFlight = false;
let lastUploadMs = 0;

const TARGET_FPS = 15;
const FRAME_INTERVAL_MS = Math.round(1000 / TARGET_FPS);
const TARGET_WIDTH = 640;
const JPEG_QUALITY_FAST = 0.5;
const JPEG_QUALITY_CLEAR = 0.62;
const UPLOAD_TIMEOUT_MS = 1200;

async function startCamera() {
  stopped = true;
  stopSendLoop();

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  stopped = false;
  statusEl.textContent = "Requesting camera permission...";
  statusEl.classList.remove("error");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: TARGET_FPS, max: TARGET_FPS },
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    statusEl.textContent = "Streaming to computer";
    sendLoop();
  } catch (error) {
    statusEl.textContent = "Camera blocked: use HTTPS and allow permission.";
    statusEl.classList.add("error");
  }
}

function stopSendLoop() {
  if (streamTimer) {
    clearInterval(streamTimer);
    streamTimer = null;
  }
  sending = false;
  uploadInFlight = false;
}

function waitForBlob() {
  const quality = lastUploadMs > FRAME_INTERVAL_MS * 2 ? JPEG_QUALITY_FAST : JPEG_QUALITY_CLEAR;
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function sendFrame() {
  if (stopped || uploadInFlight || video.readyState < 2 || video.videoWidth <= 0) {
    return;
  }

  uploadInFlight = true;
  const startedAt = performance.now();

  const targetWidth = Math.min(video.videoWidth, TARGET_WIDTH);
  const scale = targetWidth / video.videoWidth;
  const nextWidth = Math.round(video.videoWidth * scale);
  const nextHeight = Math.round(video.videoHeight * scale);

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await waitForBlob();
  if (!blob || stopped) {
    uploadInFlight = false;
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    await fetch(`/frame/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
      cache: "no-store",
      keepalive: false,
      signal: controller.signal,
    });
    lastUploadMs = performance.now() - startedAt;
    statusEl.textContent = lastUploadMs > 500 ? "Streaming, lowering quality" : "Streaming to computer";
  } catch (error) {
    statusEl.textContent = "Connection slow. Dropping late frames...";
  } finally {
    clearTimeout(timeout);
    uploadInFlight = false;
  }
}

function sendLoop() {
  if (sending) return;
  sending = true;
  sendFrame();
  streamTimer = setInterval(sendFrame, FRAME_INTERVAL_MS);
}

switchButton.addEventListener("click", () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  startCamera();
});

if (!navigator.mediaDevices?.getUserMedia) {
  statusEl.textContent = "This browser does not support camera capture.";
  statusEl.classList.add("error");
} else {
  startCamera();
}
