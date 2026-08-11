import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

try:
    from mangum import Mangum
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "mangum", "-q"])
    from mangum import Mangum

from main import app

handler = Mangum(app, lifespan="off")
