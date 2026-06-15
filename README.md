# CamLink Phone Webcam

This Python website pairs a computer browser with a mobile phone using a QR code. The phone camera sends JPEG frames to the Python server, and the computer page displays them as a live webcam-style preview.

## Local setup

```powershell
python -m pip install -r requirements.txt
python app.py
```

Open the desktop URL printed by the app on your computer. For local testing, scan the QR code with your phone while both devices are on the same Wi-Fi network.

## Deploy as a website

Deploy the repository to a Python web host that provides HTTPS, such as Render, Railway, Fly.io, or a VPS behind Nginx/Caddy. This is the WhatsApp-style mode: the desktop and phone both connect outward to the same public website, so the phone does not need to open your laptop's private IP address.

The included `Procfile` runs:

```bash
gunicorn app:app --workers 1 --threads 8 --timeout 120
```

Use one worker process because live camera frames are kept in memory for each QR session. Multiple threads are fine.

If your public site URL is different from what Flask sees behind a proxy, set:

```text
PUBLIC_BASE_URL=https://your-domain.example
```

That keeps QR codes pointed at the real website domain.

## Important HTTPS note

Mobile browsers usually block camera access on normal `http://` LAN pages. For reliable phone camera access, run the app with HTTPS:

```powershell
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=phone-webcam"
python app.py --cert cert.pem --key key.pem
```

Your phone may show a certificate warning because this is a local self-signed certificate. Accept it only on your own trusted network.

## What it does

- Website landing page creates a fresh pairing session.
- QR code opens the matching mobile capture page for that same session.
- Desktop polls the pairing status and shows when the QR is scanned and when streaming starts.
- Phone asks for camera permission and starts streaming frames.
- Computer receives the live feed at the same pairing session.

## Limit

This displays the phone camera inside the website. It does not install a virtual webcam device into Zoom, Meet, or other desktop apps. For that, you would need an extra virtual camera driver such as OBS Virtual Camera.
