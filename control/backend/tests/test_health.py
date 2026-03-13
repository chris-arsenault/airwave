"""Basic smoke tests for the API."""

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client():
    # Import here to avoid pywiim import at collection time
    from wiim_control.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
