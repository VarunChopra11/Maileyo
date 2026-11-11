from fastapi import FastAPI
from api.v1.routers.auth_routers import google
from api.v1.routers.email_routers import emails
from fastapi.middleware.cors import CORSMiddleware
from api.v1.db.init_db import init_db, close_db
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()

app = FastAPI(lifespan=lifespan)

origins = [
    "https://app.maileyo.in",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(google.router, tags=["auth"])
app.include_router(emails.router, tags=["emails"])
app.include_router(google.router, prefix="/api/v1", tags=["auth"])
app.include_router(emails.router, prefix="/api/v1", tags=["emails"])

@app.get("/wakeup")
async def wakeup():
    return {"status": "awake", "message": "This server is awake."}

@app.head("/wakeup")
async def wakeup_head():
    return


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
