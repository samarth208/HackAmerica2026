import os
import tempfile

# ── Must be set before any backend module is imported ─────────────────────────
_TEST_DB = tempfile.mktemp(suffix="_aegis_test.db")
os.environ["DB_PATH"] = _TEST_DB

# Now safe to import backend modules
import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from backend.db import init_db  # noqa: E402
from backend.main import app  # noqa: E402


@pytest.fixture(autouse=True, scope="session")
def _initialise_db():
    """Create schema + seed data once for the entire test session."""
    init_db()


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
