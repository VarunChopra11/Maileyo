import asyncio
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

async def verify_id_token_with_retry(id_token_str: str, client_id: str, max_retries: int = 3, delay: float = 1.0):
    for attempt in range(max_retries):
        try:
            return id_token.verify_oauth2_token(
                id_token_str,
                google_requests.Request(),
                client_id
            )
        except ValueError as ve:
            if "Token used too early" in str(ve) and attempt < max_retries - 1:
                print("Retrying token verification due to early token use...")
                await asyncio.sleep(delay)
            else:
                raise

