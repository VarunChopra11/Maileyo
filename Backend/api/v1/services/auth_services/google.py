import httpx
from fastapi import Request, HTTPException
from api.v1.utils.verify_id_token import verify_id_token_with_retry
from api.v1.utils.validate_scopes import validate_scopes
from api.v1.utils.jwt import create_jwt_token
from datetime import datetime, timezone, timedelta
import logging

from api.v1.config import auth_config
from api.v1.db.session import DatabaseSession
from api.v1.schemas.users import UserCreate, OAuthToken

logger = logging.getLogger(__name__)

class GoogleAuthService:

    def __init__(self):
        self.REQUIRED_SCOPES = {
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.compose",
            "https://www.googleapis.com/auth/gmail.modify",
        }
        self.JWT_TOKEN_EXPIRE_MINUTES = 10080 # 7 Days
        self.GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/auth"       
        self.GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
        self.fernet = auth_config.FERNET_KEY

    def encrypt_token(self, token: str) -> str:
        """Encrypt token using Fernet symmetric encryption"""
        return self.fernet.encrypt(token.encode()).decode()

    def get_google_auth_url(self, state: str) -> str:
        scopes = " ".join(self.REQUIRED_SCOPES)
        scope_param = scopes.replace(" ", "%20")

        return (
            f"{self.GOOGLE_AUTH_URL}?"
            f"client_id={auth_config.GOOGLE_CLIENT_ID}&"
            f"response_type=code&"
            f"redirect_uri={auth_config.GOOGLE_REDIRECT_URI}&"
            f"scope={scope_param}&"
            f"state={state}&"
            f"access_type=offline&"
            f"prompt=consent"
        )


    async def handle_google_callback(self, code: str, state: str, request: Request) -> dict:
        stored_state = request.cookies.get("oauth_state")
        if not stored_state or stored_state != state:
            logger.error(f"Invalid OAuth state: stored={stored_state}, received={state}")
            raise HTTPException(status_code=400, detail="Invalid or missing OAuth state")

        try:
            async with httpx.AsyncClient() as client:
                token_response = await client.post(
                    self.GOOGLE_TOKEN_URL,
                    data={
                        "code": code,
                        "client_id": auth_config.GOOGLE_CLIENT_ID,
                        "client_secret": auth_config.GOOGLE_CLIENT_SECRET,
                        "redirect_uri": auth_config.GOOGLE_REDIRECT_URI,
                        "grant_type": "authorization_code",
                    },
                    timeout=10
                )
                token_response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"Token exchange failed: {str(e)}")
            raise HTTPException(
                status_code=502,
                detail="Failed to exchange authorization code for tokens"
            ) from e

        token_data = token_response.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        id_token_str = token_data.get("id_token")
        
        if not access_token:
            logger.error("Missing access token in Google response")
            raise HTTPException(status_code=400, detail="Missing access token in response")
        if not refresh_token:
            logger.error("Missing refresh token in Google response")
            raise HTTPException(status_code=400, detail="Missing refresh token in response")
        if not id_token_str:
            logger.error("Missing ID token in Google response")
            raise HTTPException(status_code=400, detail="Missing ID token in response")

        # Encrypt tokens before storage
        encrypted_access_token = self.encrypt_token(access_token)
        encrypted_refresh_token = self.encrypt_token(refresh_token)

        # Scope validation
        validate_scopes(token_data.get("scope", ""))

        # Calculate token expirations
        now = datetime.now(timezone.utc)
        expires_in = token_data.get("expires_in")
        refresh_expires_in = token_data.get("refresh_token_expires_in")
        
        if not expires_in or expires_in <= 0:
            expires_in = 3600
        
        access_token_expiry = now + timedelta(seconds=expires_in)

        # Standard Google OAuth 2.0 Web Server Flow does not return refresh_token_expires_in.
        # Fallback to 6 months (180 days) if not provided.
        if refresh_expires_in and refresh_expires_in > 0:
            refresh_token_expiry = now + timedelta(seconds=refresh_expires_in)
        else:
            refresh_token_expiry = now + timedelta(days=180)

        # Verify ID token
        try:
            id_info = await verify_id_token_with_retry(id_token_str, auth_config.GOOGLE_CLIENT_ID)
        except ValueError as ve:
            logger.error(f"Invalid ID token: {str(ve)}")
            raise HTTPException(status_code=400, detail="Invalid ID token") from ve

        # Extract user information
        email = id_info.get("email")
        name = id_info.get("name")
        picture = str(id_info.get("picture"))
        google_id_val = id_info.get("sub")

        if not all([email, google_id_val]):
            logger.error("Incomplete user info from Google")
            raise HTTPException(status_code=400, detail="Incomplete user info from Google")

        # Create user object
        try:
            user = UserCreate(
                email=email,
                name=name,
                picture=picture,
                google_id=google_id_val,
                oauth=[OAuthToken(
                    service="google",
                    access_token=encrypted_access_token,
                    refresh_token=encrypted_refresh_token,
                    access_token_expiry=access_token_expiry,
                    refresh_token_expiry=refresh_token_expiry
                )],
                created_at=now,
                updated_at=now
            )
        except Exception as e:
            logger.error(f"User validation error: {str(e)}")
            raise HTTPException(status_code=422, detail="Invalid user data format") from e

        # Save user to database
        db = DatabaseSession.get_db()
        try:
            await db["users"].update_one(
                {"email": user.email, "google_id": user.google_id},
                {
                    "$set": user.model_dump(exclude={"created_at"}, by_alias=True),
                    "$setOnInsert": {"created_at": user.created_at}
                },
                upsert=True
            )

        except Exception as e:
            logger.error(f"Database error: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to save user information"
            ) from e
        
        data = {
            "user_id": user.google_id,
            "email": user.email,
            "name": user.name,
            "picture": str(user.picture),
        }

        # Create JWT token
        jwt_token  = create_jwt_token(data, expires_delta=timedelta(minutes=self.JWT_TOKEN_EXPIRE_MINUTES))
        response = {
            "user": data,
            "token": jwt_token,
        }

        return response
    