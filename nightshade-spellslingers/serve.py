"""Local server for Nightshade Spellslinging that tells the browser not to cache files,
so changes to the game show up on a normal refresh."""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8765))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


# No address reuse: on Windows it would let two servers share the port silently.
socketserver.TCPServer.allow_reuse_address = False
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"Serving Nightshade Spellslinging on http://localhost:{PORT}")
    httpd.serve_forever()
