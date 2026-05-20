import argparse
import base64
import os
import socket
import ssl
import threading
import time
import uuid
from io import BytesIO

from flask import Flask, Response, abort, jsonify, make_response, redirect, render_template, request, url_for
from werkzeug.middleware.proxy_fix import ProxyFix

try:
    import qrcode
    import qrcode.image.svg
except ImportError:  # pragma: no cover - shown in browser/terminal for setup help
    qrcode = None


app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

sessions = {}
sessions_lock = threading.Lock()
PLACEHOLDER_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/"
    "xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/"
    "xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/"
    "2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z"
)


def get_lan_ip():
    """Return the LAN address phones on the same Wi-Fi can usually reach."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def is_local_host(hostname):
    return hostname in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def public_url_for(endpoint, **values):
    base_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    path = url_for(endpoint, **values)
    if base_url:
        return f"{base_url}{path}"

    hostname = request.host.split(":", 1)[0].strip("[]")
    if is_local_host(hostname):
        scheme = "https" if request.is_secure else "http"
        port = f":{request.environ.get('SERVER_PORT')}" if request.environ.get("SERVER_PORT") else ""
        return f"{scheme}://{get_lan_ip()}{port}{path}"

    return request.url_root.rstrip("/") + path


@app.after_request
def no_cache_dynamic_pages(response):
    if response.content_type.startswith("text/html") or response.content_type.startswith("image/svg+xml"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


def get_session(session_id):
    with sessions_lock:
        return sessions.setdefault(
            session_id,
            {
                "frame": None,
                "updated": 0.0,
                "created": time.time(),
                "scanned": 0.0,
                "condition": threading.Condition(),
            },
        )


def put_frame(session_id, frame):
    session = get_session(session_id)
    with session["condition"]:
        session["frame"] = frame
        session["updated"] = time.time()
        session["condition"].notify_all()


def stream_frames(session_id):
    session = get_session(session_id)
    last_seen = 0.0

    while True:
        with session["condition"]:
            session["condition"].wait_for(
                lambda: session["updated"] > last_seen,
                timeout=1,
            )
            if session["updated"] > last_seen:
                frame = session["frame"]
                last_seen = session["updated"]
            else:
                frame = PLACEHOLDER_JPEG

        if frame is None:
            frame = PLACEHOLDER_JPEG

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n"
            + f"Content-Length: {len(frame)}\r\n\r\n".encode("ascii")
            + frame
            + b"\r\n"
        )


@app.route("/")
def index():
    session_id = uuid.uuid4().hex[:10]
    return redirect(url_for("desktop", session_id=session_id, t=int(time.time())))


@app.route("/new")
def new_session():
    session_id = uuid.uuid4().hex[:10]
    return redirect(url_for("desktop", session_id=session_id, t=int(time.time())))


@app.route("/desktop/<session_id>")
def desktop(session_id):
    return render_desktop(session_id)


def render_desktop(session_id):
    connect_url = public_url_for("connect", session_id=session_id)
    phone_url = public_url_for("phone", session_id=session_id)
    secure = request.is_secure or connect_url.startswith("https://")
    return render_template(
        "desktop.html",
        session_id=session_id,
        connect_url=connect_url,
        phone_url=phone_url,
        secure=secure,
        cache_bust=int(time.time()),
    )


@app.route("/connect/<session_id>")
def connect(session_id):
    session = get_session(session_id)
    session["scanned"] = time.time()
    return render_template(
        "connect.html",
        session_id=session_id,
        phone_url=public_url_for("phone", session_id=session_id),
    )


@app.route("/ping")
def ping_page():
    return render_template("ping.html", now=int(time.time()))


@app.route("/phone/<session_id>")
def phone(session_id):
    session = get_session(session_id)
    session["scanned"] = time.time()
    return render_template("phone.html", session_id=session_id, cache_bust=int(time.time()))


@app.route("/qr/<session_id>.svg")
def qr_svg(session_id):
    if qrcode is None:
        return make_response(
            "Install dependencies first: pip install -r requirements.txt",
            503,
        )

    connect_url = public_url_for("connect", session_id=session_id)
    image = qrcode.make(connect_url, image_factory=qrcode.image.svg.SvgPathImage)
    buffer = BytesIO()
    image.save(buffer)

    response = make_response(buffer.getvalue())
    response.headers["Content-Type"] = "image/svg+xml"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/frame/<session_id>", methods=["POST"])
def frame(session_id):
    if request.content_type != "image/jpeg":
        abort(415, "Only image/jpeg frames are accepted")

    frame_bytes = request.get_data(cache=False)
    if not frame_bytes:
        abort(400, "Empty frame")
    if len(frame_bytes) > 900_000:
        abort(413, "Frame is too large")

    put_frame(session_id, frame_bytes)
    return ("", 204)


@app.route("/status/<session_id>")
def status(session_id):
    session = get_session(session_id)
    now = time.time()
    scanned = bool(session["scanned"])
    streaming = bool(session["updated"] and now - session["updated"] < 3)

    if streaming:
        state = "streaming"
        message = "Phone camera is streaming"
    elif scanned:
        state = "scanned"
        message = "Phone linked, waiting for camera"
    else:
        state = "waiting"
        message = "Waiting for QR scan"

    return jsonify(
        {
            "state": state,
            "message": message,
            "sessionId": session_id,
            "secondsSinceFrame": round(now - session["updated"], 1) if session["updated"] else None,
        }
    )


@app.route("/stream/<session_id>")
def stream(session_id):
    return Response(
        stream_frames(session_id),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


def parse_args():
    parser = argparse.ArgumentParser(description="Use a phone camera as a browser webcam over Wi-Fi.")
    parser.add_argument("--host", default="0.0.0.0", help="Host/IP to bind. Use 0.0.0.0 for LAN access.")
    parser.add_argument("--port", default=int(os.environ.get("PORT", 5000)), type=int, help="Port to listen on.")
    parser.add_argument("--cert", help="TLS certificate file for HTTPS.")
    parser.add_argument("--key", help="TLS private key file for HTTPS.")
    return parser.parse_args()


def main():
    args = parse_args()
    lan_ip = get_lan_ip()
    scheme = "https" if args.cert and args.key else "http"
    ssl_context = None

    if args.cert and args.key:
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(args.cert, args.key)

    print()
    print("Phone Webcam is running")
    print(f"Desktop URL: {scheme}://{lan_ip}:{args.port}")
    if scheme == "http":
        print("Note: phone camera access usually needs HTTPS. Deploy to HTTPS or use a tunnel for phone testing.")
    print()

    app.run(host=args.host, port=args.port, threaded=True, ssl_context=ssl_context)


if __name__ == "__main__":
    main()
