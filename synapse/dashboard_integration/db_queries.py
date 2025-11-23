"""Database query placeholders for Dashboard integration.

Future work: read enforcement state from `dashboard` schema tables.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


async def load_user_routing_state(_hs, _user_id: str) -> Optional[Dict[str, Any]]:
    """Placeholder for reading a user's enforcement state from DB.

    Returns a dict when found, else None.
    """

    return None

