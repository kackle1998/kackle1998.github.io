"""Local server for Brimstone Slingshot that tells the browser not to cache files,
so changes to the game show up on a normal refresh."""
import http.server
import json
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8765))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # The scene builder (builder.html) saves its picks here, for the event-animation skill to read.
    def do_POST(self):
        if self.path != "/builder/picks":
            self.send_error(404)
            return
        body = self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 64 * 1024))
        try:
            json.loads(body)
        except ValueError:
            self.send_error(400, "not JSON")
            return
        with open("builder-picks.json", "wb") as f:
            f.write(body)
        self.send_response(200)
        self.end_headers()


# No address reuse: on Windows it would let two servers share the port silently.
socketserver.TCPServer.allow_reuse_address = False
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"Serving Brimstone Slingshot on http://localhost:{PORT}")
    httpd.serve_forever()
