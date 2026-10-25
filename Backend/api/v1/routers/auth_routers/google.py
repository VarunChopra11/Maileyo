from fastapi import APIRouter, Request, Response, status, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from api.v1.services.auth_services.google import GoogleAuthService
from api.v1.utils.tokens import get_current_user
from api.v1.schemas.users import UserResponse
from api.v1.config import auth_config
import secrets
from typing import Optional


router = APIRouter()

google_auth_service = GoogleAuthService()

def get_cookie_domain(request: Request) -> Optional[str]:
    host = request.url.hostname or ""
    frontend_url = getattr(auth_config, "FRONTEND_URL", "") or ""
    if "localhost" in host or "127.0.0.1" in host or "localhost" in frontend_url or "127.0.0.1" in frontend_url:
        return None
    if "maileyo.in" in host or "maileyo.in" in frontend_url:
        return ".maileyo.in"
    return None

def is_cookie_secure(request: Request) -> bool:
    host = request.url.hostname or ""
    frontend_url = getattr(auth_config, "FRONTEND_URL", "") or ""
    if "localhost" in host or "127.0.0.1" in host or "localhost" in frontend_url or "127.0.0.1" in frontend_url:
        return request.url.scheme == "https"
    return True

@router.get("/login/google")
async def login_google(request: Request):
    state = secrets.token_urlsafe(32)
    auth_url = google_auth_service.get_google_auth_url(state)
    response = RedirectResponse(url=auth_url)
    
    cookie_domain = get_cookie_domain(request)
    secure = is_cookie_secure(request)
    cookie_kwargs = {
        "key": "oauth_state",
        "value": state,
        "httponly": True,
        "secure": secure,
        "samesite": "lax"
    }
    if cookie_domain:
        cookie_kwargs["domain"] = cookie_domain

    response.set_cookie(**cookie_kwargs)
    return response

@router.get("/auth/google/callback")
async def auth_google_callback(
    code: str,
    state: str,
    request: Request,
    response: Response,
):
    try:
        result = await google_auth_service.handle_google_callback(code, state, request)
        frontend_url = auth_config.FRONTEND_URL
        redirect_response = RedirectResponse(url=frontend_url)

        cookie_domain = get_cookie_domain(request)
        secure = is_cookie_secure(request)
        samesite = "none" if secure else "lax"

        cookie_kwargs = {
            "key": "token",
            "value": result["token"],
            "max_age": google_auth_service.JWT_TOKEN_EXPIRE_MINUTES * 60,
            "httponly": True,
            "secure": secure,
            "samesite": samesite
        }
        if cookie_domain:
            cookie_kwargs["domain"] = cookie_domain

        # Set JWT token in HTTP-only cookie for user identification
        redirect_response.set_cookie(**cookie_kwargs)
        return redirect_response
    
    except HTTPException as http_exc:
        return JSONResponse(
            status_code=http_exc.status_code,
            content={"error": http_exc.detail}
        )
    
    except Exception as e:
        print("Error in auth_google_callback:", e)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "Internal server error during authentication."}
        )

@router.get("/auth/google/user", response_model=UserResponse)
async def get_user(request: Request):
    try:
        user = await get_current_user(request)
        return UserResponse(
            email=user["email"],
            name=user.get("name"),
            picture=user.get("picture"),
            google_id=user["google_id"]
        )
    
    except HTTPException as http_exc:
        return JSONResponse(
            status_code=http_exc.status_code,
            content={"error": http_exc.detail}
        )
    
    except Exception as e:
        print("Error in get_current_user:", e)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "Internal server error while fetching user."}
        )

@router.post("/auth/logout")
async def logout(request: Request):
    response = Response(content="Logged out successfully")
    cookie_domain = get_cookie_domain(request)
    delete_kwargs = {"key": "token"}
    if cookie_domain:
        delete_kwargs["domain"] = cookie_domain
    response.delete_cookie(**delete_kwargs)
    return response
