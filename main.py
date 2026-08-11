import os
import sys

_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from main import app

if __name__ == "__main__":
    import uvicorn
    porta = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"[Curia IA] Iniciando servidor (RAIZ wrapper) em {host}:{porta} (backend em /backend)")
    uvicorn.run(
        "main:app",
        host=host,
        port=porta,
        reload=False,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
