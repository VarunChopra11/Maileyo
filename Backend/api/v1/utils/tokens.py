import httpx
from fastapi import HTTPException, status, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from jose import JWTError, jwt, ExpiredSignatureError
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta

from api.v1.config import auth_config
from api.v1.db.session import DatabaseSession

fernet = auth_config.FERNET_KEY


async def get_token_from_cookie(request: Request) -> str:
    token = request.cookies.get("token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )
    return token


async def get_current_user(
    request: Request,
):
    db = DatabaseSession.get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection not available"
        )

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = await get_token_from_cookie(request)
        payload = jwt.decode(token, auth_config.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id: str = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
    except ExpiredSignatureError:
        raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await db["users"].find_one(
        {"google_id": user_id},
        {"_id": 0, "email": 1, "name": 1, "picture": 1, "google_id": 1}
    )

    if not user:
        raise credentials_exception

    return user


def decrypt_oauth_tokens(oauth_token: dict) -> dict:
    try:
        return {
            "access_token": fernet.decrypt(oauth_token["access_token"].encode()).decode(),
            "refresh_token": fernet.decrypt(oauth_token["refresh_token"].encode()).decode(),
            "access_token_expiry": oauth_token.get("access_token_expiry"),
            "refresh_token_expiry": oauth_token.get("refresh_token_expiry")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decrypt tokens: {str(e)}")


async def get_oauth_tokens(
    db: AsyncIOMotorDatabase,
    google_id: str = None
) -> Optional[dict]:
    if not google_id:
        raise ValueError("User profile must be provided")

    user_doc = await db["users"].find_one(
        {"google_id": google_id},
        {"_id": 0, "oauth": 1}
    )

    if not user_doc or "oauth" not in user_doc:
        raise HTTPException(status_code=404, detail="OAuth tokens not found")

    for token in user_doc["oauth"]:
        if token.get("service") == "google":
            return decrypt_oauth_tokens(token)

    raise HTTPException(status_code=404, detail="Google OAuth tokens not found")


async def refresh_access_token(refresh_token: str) -> Optional[Dict[str, Any]]:
    token_url = "https://oauth2.googleapis.com/token"

    payload = {
        "client_id": auth_config.GOOGLE_CLIENT_ID,
        "client_secret": auth_config.GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(token_url, data=payload, headers=headers)
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Token refresh request failed: {str(e)}")

    if response.status_code == 200:
        return response.json()
    elif response.status_code == 400 and "invalid_grant" in response.text.lower():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired"
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Failed to refresh token: {response.status_code}"
        )


async def get_access_token(
    user: Optional[dict] = None,
    google_id: Optional[str] = None
) -> str:
    db = DatabaseSession.get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection not available"
        )

    target_google_id = google_id or (user["google_id"] if user else None)
    if not target_google_id:
        raise ValueError("Either user dict or google_id must be provided")

    tokens = await get_oauth_tokens(db=db, google_id=target_google_id)
    now = datetime.now(timezone.utc)
    
    # Check access token expiry
    access_expiry = tokens.get("access_token_expiry")
    if access_expiry:
        if access_expiry.tzinfo is None:
            access_expiry = access_expiry.replace(tzinfo=timezone.utc)
        if access_expiry > now:
            return tokens["access_token"]

    # Check refresh token expiry (if set)
    refresh_expiry = tokens.get("refresh_token_expiry")
    if refresh_expiry is not None:
        if refresh_expiry.tzinfo is None:
            refresh_expiry = refresh_expiry.replace(tzinfo=timezone.utc)
        if refresh_expiry <= now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token expired"
            )

    # Perform async refresh
    refreshed = await refresh_access_token(tokens["refresh_token"])
    if not refreshed or "access_token" not in refreshed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to refresh access token"
        )

    new_access_token = refreshed["access_token"]
    expires_in = refreshed.get("expires_in", 3599)
    new_expiry = now + timedelta(seconds=expires_in)
    encrypted_new_token = fernet.encrypt(new_access_token.encode()).decode()

    # CRITICAL FIX: Persist the refreshed token back to MongoDB to eliminate repeat refresh loops
    await db["users"].update_one(
        {"google_id": target_google_id, "oauth.service": "google"},
        {
            "$set": {
                "oauth.$.access_token": encrypted_new_token,
                "oauth.$.access_token_expiry": new_expiry,
                "updated_at": now
            }
        }
    )

    return new_access_token
