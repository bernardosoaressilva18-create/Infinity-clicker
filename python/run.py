#!/usr/bin/env python3
"""Servidor de desenvolvimento local do Infinity Clicker, usando a biblioteca padrão."""
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

class Handler(SimpleHTTPRequestHandler):
    server_version = "InfinityClickerDev/1.0"
    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/health":
            body = json.dumps({"ok": True, "jogo": "Infinity Clicker"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/":
            self.path = "/index.html"
        return super().do_GET()

def main():
    parser = argparse.ArgumentParser(description="Executa o Infinity Clicker localmente.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if not PUBLIC.is_dir():
        raise SystemExit(f"Pasta pública não encontrada: {PUBLIC}")
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(PUBLIC)))
    print(f"Infinity Clicker: http://{args.host}:{args.port} (Ctrl+C para encerrar)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
