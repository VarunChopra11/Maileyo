from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

# Synchronized with GoogleAuthService.REQUIRED_SCOPES
REQUIRED_SCOPES = {
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
}


def normalize_scope(scope: str) -> str:
    mapping = {
        "https://www.googleapis.com/auth/userinfo.email": "email",
        "https://www.googleapis.com/auth/userinfo.profile": "profile"
    }
    return mapping.get(scope, scope)


def expand_scopes(granted_scopes: set) -> set:
    """Expand scopes if broader scopes (like gmail.modify or mail.google.com) were granted."""
    expanded = set(granted_scopes)
    if "https://mail.google.com/" in expanded or "https://www.googleapis.com/auth/gmail.modify" in expanded:
        expanded.add("https://www.googleapis.com/auth/gmail.modify")
        expanded.add("https://www.googleapis.com/auth/gmail.compose")
        expanded.add("https://www.googleapis.com/auth/gmail.send")
        expanded.add("https://www.googleapis.com/auth/gmail.readonly")
    return expanded


def validate_scopes(scope_string: str):
    """
    Validates that all required scopes are granted.
    Raises HTTPException if any required scope is missing.
    """
    raw_scopes = scope_string.split()
    granted_scopes = {normalize_scope(scope) for scope in raw_scopes}
    expanded_granted = expand_scopes(granted_scopes)

    if not REQUIRED_SCOPES.issubset(expanded_granted):
        missing_scopes = REQUIRED_SCOPES - expanded_granted
        logger.error(f"Missing required scopes: {missing_scopes}")
        raise HTTPException(
            status_code=403,
            detail=f"Missing required permissions: {', '.join(missing_scopes)}"
        )

