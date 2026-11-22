"""The hub's stand-in for Home Assistant's "HTML5 Push Notifications" integration.

Like the real one it hands out a public key (websocket notify/html5/appkey),
takes registrations at /api/notify.html5 (POST to add, DELETE to remove), makes
a notify entity per registered device, and sends real web pushes when
notify.send_message targets one. Sending needs the pywebpush package:

    python -m pip install pywebpush

Without it the hub still runs; asking for the key then fails like a Home
Assistant that doesn't have the integration.
"""
import base64
import json
import time
import uuid

try:
    from py_vapid import Vapid
    from pywebpush import WebPushException, webpush
    from cryptography.hazmat.primitives import serialization
    AVAILABLE = True
except ImportError:
    AVAILABLE = False

# Push services (Apple's especially) refuse made-up contact addresses in the
# signed request, so this is the Evra website.
CONTACT = "https://evrasmarthome.com"


class Push:
    def __init__(self, data_dir):
        self.key_file = data_dir / "vapid_private.pem"
        self._vapid = None

    def public_key(self):
        """The base64url public key the browser subscribes with (like entry.data["vapid_pub_key"])."""
        if not AVAILABLE:
            return None
        if self._vapid is None:
            if self.key_file.exists():
                self._vapid = Vapid.from_file(str(self.key_file))
            else:
                self._vapid = Vapid()
                self._vapid.generate_keys()
                self._vapid.save_key(str(self.key_file))
        raw = self._vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    def send(self, subscription, title, message, extra=None):
        """Sends one push (blocking: run it in an executor). Returns None, or "gone" when
        the browser has dropped the subscription, or an error text."""
        if not AVAILABLE:
            return "pywebpush isn't installed"
        self.public_key()  # makes sure the key exists
        extra = dict(extra or {})
        payload = {**extra, "title": title or "Home Assistant", "body": message, "tag": extra.get("tag") or str(uuid.uuid4()),
                   "timestamp": int(time.time() * 1000), "data": dict(extra.get("data") or {})}
        try:
            webpush(subscription_info=subscription, data=json.dumps(payload), vapid_private_key=str(self.key_file),
                    vapid_claims={"sub": CONTACT}, ttl=86400)
            return None
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            return "gone" if status in (404, 410) else f"push service said {status or e}"
        except Exception as e:  # network trouble and the like; keep the hub running
            return f"{type(e).__name__}: {e}"
