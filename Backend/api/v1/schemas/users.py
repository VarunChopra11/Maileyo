from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime


class OAuthToken(BaseModel):
    service: str = Field(..., example="google")
    access_token: str = Field(..., min_length=10)
    refresh_token: str = Field(..., min_length=10)
    access_token_expiry: datetime
    refresh_token_expiry: Optional[datetime] = None



class UserCreate(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    picture: Optional[str] = None
    google_id: str = Field(..., min_length=5)
    oauth: List[OAuthToken]
    created_at: Optional[datetime] = None
    updated_at: datetime

class UserResponse(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    picture: Optional[str] = None
    google_id: str
