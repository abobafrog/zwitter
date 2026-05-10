from __future__ import annotations

import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import jwt
import requests
import socketio
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from requests import RequestException
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/twitter_clone")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-jwt-secret-change-in-production-min-32-chars")
JWT_REFRESH_SECRET = os.getenv("JWT_REFRESH_SECRET", "dev-refresh-secret-change-in-production-min-32-chars")
ACCESS_MINUTES = 15
REFRESH_DAYS = int(os.getenv("JWT_REFRESH_TTL_DAYS", "7"))
REFRESH_COOKIE = "zw_refresh"
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="Zwitter Python Backend")
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*", logger=False, engineio_logger=False)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

origins = [
    origin.strip()
    for origin in (os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_URL") or "http://localhost:3000").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
active_calls: dict[str, dict[str, Any]] = {}


def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def row_one(db: Session, sql: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    row = db.execute(text(sql), params or {}).mappings().first()
    return dict(row) if row else None


def rows(db: Session, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(text(sql), params or {}).mappings().all()]


def scalar(db: Session, sql: str, params: dict[str, Any] | None = None) -> Any:
    return db.execute(text(sql), params or {}).scalar()


def clean(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, list):
        return [clean(item) for item in obj]
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    return obj


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def make_access(user_id: str) -> str:
    payload = {"userId": user_id, "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_MINUTES)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def make_refresh(user_id: str) -> str:
    payload = {
        "userId": user_id,
        "jti": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_DAYS),
    }
    return jwt.encode(payload, JWT_REFRESH_SECRET, algorithm="HS256")


def set_refresh_cookie(response: Response, token: str):
    secure = os.getenv("COOKIE_SECURE") == "true" or os.getenv("NODE_ENV") == "production"
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        httponly=True,
        secure=secure,
        samesite=os.getenv("COOKIE_SAMESITE") or ("none" if secure else "lax"),
        path="/api/auth",
        max_age=REFRESH_DAYS * 24 * 60 * 60,
    )


def clear_refresh_cookie(response: Response):
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")


def save_refresh(db: Session, token: str, user_id: str):
    db.execute(
        text('INSERT INTO refresh_tokens (id, token, user_id, expires_at, created_at) VALUES (:id, :token, :user_id, :expires_at, :created_at)'),
        {
            "id": str(uuid.uuid4()),
            "token": token_hash(token),
            "user_id": user_id,
            "expires_at": now_utc() + timedelta(days=REFRESH_DAYS),
            "created_at": now_utc(),
        },
    )


def public_user(db: Session, user_id: str) -> dict[str, Any] | None:
    user = row_one(
        db,
        """
        SELECT id, username, email, email_verified AS "emailVerified", email_verified_at AS "emailVerifiedAt",
               display_name AS "displayName", bio, avatar_url AS "avatarUrl", banner_url AS "bannerUrl",
               birth_date AS "birthDate", is_verified AS "isVerified", is_community AS "isCommunity",
               block_group_invites AS "blockGroupInvites", message_privacy AS "messagePrivacy",
               notify_likes AS "notifyLikes", notify_replies AS "notifyReplies", notify_retweets AS "notifyRetweets",
               notify_follows AS "notifyFollows", notify_messages AS "notifyMessages", created_at AS "createdAt"
        FROM users WHERE id=:id
        """,
        {"id": user_id},
    )
    return clean(user) if user else None


def current_user(request: Request, db: Session = Depends(db_session)) -> dict[str, Any]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"error": "Требуется авторизация"})
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail={"error": "Token expired", "code": "TOKEN_EXPIRED"})
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail={"error": "Недействительный токен"})
    user = public_user(db, payload.get("userId"))
    if not user:
        raise HTTPException(status_code=401, detail={"error": "Пользователь не найден"})
    return user


def optional_user(request: Request, db: Session = Depends(db_session)) -> dict[str, Any] | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        payload = jwt.decode(auth.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    return public_user(db, payload.get("userId"))


def api_error(error: HTTPException):
    detail = error.detail
    return detail if isinstance(detail, dict) else {"error": str(detail)}


@app.exception_handler(HTTPException)
async def http_error(_, exc: HTTPException):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=exc.status_code, content=api_error(exc))


@app.on_event("startup")
def init_schema():
    ddl = Path(__file__).with_name("schema.sql").read_text()
    with engine.begin() as conn:
        conn.execute(text(ddl))


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": now_utc().isoformat()}


def save_upload(file: UploadFile | None) -> str | None:
    if not file or not file.filename:
        return None
    ext = Path(file.filename).suffix[:12] or ".bin"
    name = f"{uuid.uuid4()}{ext}"
    target = UPLOAD_DIR / name
    with target.open("wb") as handle:
        handle.write(file.file.read())
    return f"/uploads/{name}"


def make_account_token(db: Session, user_id: str, kind: str, raw: str | None = None, payload: str | None = None, minutes: int = 60) -> str:
    raw = raw or secrets.token_hex(32)
    db.execute(text("DELETE FROM account_tokens WHERE user_id=:user_id AND type=:type"), {"user_id": user_id, "type": kind})
    db.execute(
        text(
            """
            INSERT INTO account_tokens (id, token_hash, user_id, type, payload, expires_at, created_at)
            VALUES (:id, :token_hash, :user_id, :type, :payload, :expires_at, :created_at)
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "token_hash": token_hash(raw),
            "user_id": user_id,
            "type": kind,
            "payload": payload,
            "expires_at": now_utc() + timedelta(minutes=minutes),
            "created_at": now_utc(),
        },
    )
    return raw


def weather_label(code: int | None, temperature: float | None = None) -> str:
    if code in [51, 53, 55, 61, 63, 65, 80, 81] and temperature is not None and temperature <= 2:
        return "Слякоть"
    if code == 0:
        return "Ясно"
    if code == 1:
        return "Преимущественно ясно"
    if code == 2:
        return "Переменная облачность"
    if code == 3:
        return "Пасмурно"
    if code == 45:
        return "Туман"
    if code == 48:
        return "Инейный туман"
    if code == 51:
        return "Лёгкая морось"
    if code == 53:
        return "Морось"
    if code == 55:
        return "Сильная морось"
    if code == 56:
        return "Ледяная морось"
    if code == 57:
        return "Сильная ледяная морось"
    if code == 61:
        return "Небольшой дождь"
    if code == 63:
        return "Дождь"
    if code == 65:
        return "Сильный дождь"
    if code == 66:
        return "Ледяной дождь"
    if code == 67:
        return "Сильный ледяной дождь"
    if code == 71:
        return "Лёгкий снег"
    if code == 73:
        return "Снег"
    if code == 75:
        return "Снегопад"
    if code == 77:
        return "Снежная крупа"
    if code == 80:
        return "Кратковременный дождь"
    if code == 81:
        return "Ливень"
    if code == 82:
        return "Сильный ливень"
    if code == 85:
        return "Снежный заряд"
    if code == 86:
        return "Сильный снегопад"
    if code == 95:
        return "Гроза"
    if code == 96:
        return "Гроза с градом"
    if code == 99:
        return "Сильная гроза с градом"
    return "Погода"


def fallback_weather(city: str = "Москва", lat: float | None = None, lon: float | None = None, reason: str | None = None):
    today = now_utc().date()
    daily = []
    for index in range(5):
        temp = 18 + (index % 3)
        daily.append({
            "day": (today + timedelta(days=index)).isoformat(),
            "min": temp - 4,
            "max": temp + 3,
            "code": 2,
            "label": "Переменная облачность",
        })
    hourly = []
    for index in range(24):
        temp = 18 + (index % 5) - 2
        hourly.append({
            "time": (datetime.combine(today, datetime.min.time()) + timedelta(hours=index)).isoformat(),
            "temperature": temp,
            "feelsLike": temp - 1,
            "humidity": 60 + (index % 8),
            "windSpeed": 8 + (index % 4),
            "precipitationProbability": 15,
            "code": 2,
            "label": "Переменная облачность",
        })
    return {
        "city": city or "Москва",
        "country": "",
        "latitude": lat if lat is not None else 55.7558,
        "longitude": lon if lon is not None else 37.6173,
        "timezone": "auto",
        "fallback": True,
        "message": "Погодный провайдер временно недоступен, показываю резервный прогноз.",
        "reason": reason,
        "current": {
            "temperature": 20,
            "feelsLike": 19,
            "humidity": 62,
            "windSpeed": 9,
            "code": 2,
            "label": "Переменная облачность",
        },
        "hourly": hourly,
        "daily": daily,
    }


def notify(db: Session, user_id: str, from_id: str, kind: str, tweet_id: str | None = None):
    if not user_id or not from_id or user_id == from_id:
        return
    db.execute(
        text(
            """
            INSERT INTO notifications (id, user_id, from_id, type, tweet_id, is_read, created_at)
            VALUES (:id, :user_id, :from_id, :type, :tweet_id, false, :created_at)
            """
        ),
        {"id": str(uuid.uuid4()), "user_id": user_id, "from_id": from_id, "type": kind, "tweet_id": tweet_id, "created_at": now_utc()},
    )


def tweet_payload(db: Session, tweet_id: str, viewer_id: str | None = None, include_replies: bool = False) -> dict[str, Any] | None:
    tweet = row_one(
        db,
        """
        SELECT t.id, t.content, t.image_url AS "imageUrl", t.created_at AS "createdAt",
               t.views_count AS "viewsCount", t.parent_id AS "parentId", t.community_id AS "communityId",
               t.author_id AS "authorId",
               u.id AS "u_id", u.username AS "u_username", u.display_name AS "u_displayName",
               u.avatar_url AS "u_avatarUrl", u.is_verified AS "u_isVerified", u.is_community AS "u_isCommunity",
               c.id AS "c_id", c.slug AS "c_slug", c.name AS "c_name", c.avatar_url AS "c_avatarUrl", c.is_verified AS "c_isVerified",
               p.id AS "p_id", p.content AS "p_content", pu.username AS "p_username", pu.display_name AS "p_displayName"
        FROM tweets t
        JOIN users u ON u.id=t.author_id
        LEFT JOIN communities c ON c.id=t.community_id
        LEFT JOIN tweets p ON p.id=t.parent_id
        LEFT JOIN users pu ON pu.id=p.author_id
        WHERE t.id=:id
        """,
        {"id": tweet_id},
    )
    if not tweet:
        return None
    counts = row_one(
        db,
        """
        SELECT
          (SELECT COUNT(*) FROM likes WHERE tweet_id=:id) AS likes,
          (SELECT COUNT(*) FROM retweets WHERE tweet_id=:id) AS retweets,
          (SELECT COUNT(*) FROM tweets WHERE parent_id=:id) AS replies,
          (SELECT COUNT(*) FROM bookmarks WHERE tweet_id=:id) AS bookmarks
        """,
        {"id": tweet_id},
    )
    payload = {
        "id": tweet["id"],
        "content": tweet["content"],
        "imageUrl": tweet["imageUrl"],
        "createdAt": clean(tweet["createdAt"]),
        "viewsCount": tweet["viewsCount"],
        "parentId": tweet["parentId"],
        "communityId": tweet["communityId"],
        "author": {
            "id": tweet["u_id"],
            "username": tweet["u_username"],
            "displayName": tweet["u_displayName"],
            "avatarUrl": tweet["u_avatarUrl"],
            "isVerified": tweet["u_isVerified"],
            "isCommunity": tweet["u_isCommunity"],
        },
        "community": None,
        "parent": None,
        "_count": counts,
        "likes": [],
        "retweets": [],
        "bookmarks": [],
    }
    if tweet["c_id"]:
        payload["community"] = {
            "id": tweet["c_id"],
            "slug": tweet["c_slug"],
            "name": tweet["c_name"],
            "avatarUrl": tweet["c_avatarUrl"],
            "isVerified": tweet["c_isVerified"],
        }
    if tweet["p_id"]:
        payload["parent"] = {
            "id": tweet["p_id"],
            "content": tweet["p_content"],
            "author": {"username": tweet["p_username"], "displayName": tweet["p_displayName"]},
        }
    if viewer_id:
        payload["likes"] = [{"id": "1"}] if scalar(db, "SELECT 1 FROM likes WHERE user_id=:u AND tweet_id=:t", {"u": viewer_id, "t": tweet_id}) else []
        payload["retweets"] = [{"id": "1"}] if scalar(db, "SELECT 1 FROM retweets WHERE user_id=:u AND tweet_id=:t", {"u": viewer_id, "t": tweet_id}) else []
        payload["bookmarks"] = [{"id": "1"}] if scalar(db, "SELECT 1 FROM bookmarks WHERE user_id=:u AND tweet_id=:t", {"u": viewer_id, "t": tweet_id}) else []
    if include_replies:
        reply_ids = rows(db, "SELECT id FROM tweets WHERE parent_id=:id ORDER BY created_at DESC LIMIT 30", {"id": tweet_id})
        payload["replies"] = [tweet_payload(db, item["id"], viewer_id) for item in reply_ids]
    return payload


def tweet_list(db: Session, sql: str, params: dict[str, Any], viewer_id: str | None) -> list[dict[str, Any]]:
    return [tweet_payload(db, item["id"], viewer_id) for item in rows(db, sql, params)]


@app.post("/api/auth/register", status_code=201)
async def register(request: Request, response: Response, db: Session = Depends(db_session)):
    data = await request.json()
    username = (data.get("username") or "").strip().lower()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if len(username) < 3 or len(password) < 6 or "@" not in email:
        raise HTTPException(400, {"error": "Проверь логин, email и пароль"})
    user_id = str(uuid.uuid4())
    auto_verify = os.getenv("NODE_ENV", "development") != "production"
    try:
        db.execute(
            text(
                """
                INSERT INTO users (id, username, email, password_hash, display_name, email_verified, email_verified_at, created_at, updated_at)
                VALUES (:id, :username, :email, :password_hash, :display_name, :email_verified, :email_verified_at, :now, :now)
                """
            ),
            {
                "id": user_id,
                "username": username,
                "email": email,
                "password_hash": pwd_context.hash(password),
                "display_name": data.get("displayName") or username,
                "email_verified": auto_verify,
                "email_verified_at": now_utc() if auto_verify else None,
                "now": now_utc(),
            },
        )
        if not auto_verify:
            code = str(secrets.randbelow(900000) + 100000)
            make_account_token(db, user_id, "verify_email", raw=f"{user_id}:{code}", minutes=24 * 60)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, {"error": "Логин или email уже занят"})
    clear_refresh_cookie(response)
    return {
        "message": "Аккаунт создан. В dev-режиме email подтверждён автоматически." if auto_verify else "Аккаунт создан. Проверь почту и подтверди email.",
        "user": public_user(db, user_id),
        "emailSent": False,
        "emailAutoVerified": auto_verify,
    }


@app.post("/api/auth/login")
async def login(request: Request, response: Response, db: Session = Depends(db_session)):
    data = await request.json()
    login_value = (data.get("login") or "").strip().lower()
    user = row_one(db, "SELECT * FROM users WHERE lower(email)=:login OR lower(username)=:login", {"login": login_value})
    if not user or not pwd_context.verify(data.get("password") or "", user["password_hash"]):
        raise HTTPException(401, {"error": "Неверный логин или пароль"})
    if not user["email_verified"]:
        clear_refresh_cookie(response)
        raise HTTPException(403, {"error": "Подтверди email, чтобы войти в аккаунт", "code": "EMAIL_NOT_VERIFIED", "email": user["email"]})
    access = make_access(user["id"])
    refresh = make_refresh(user["id"])
    save_refresh(db, refresh, user["id"])
    db.commit()
    set_refresh_cookie(response, refresh)
    return {"message": "Вход выполнен", "user": public_user(db, user["id"]), "accessToken": access}


@app.post("/api/auth/refresh")
async def refresh(request: Request, response: Response, db: Session = Depends(db_session)):
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    token = body.get("refreshToken") or request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(401, {"error": "Refresh token отсутствует"})
    try:
        payload = jwt.decode(token, JWT_REFRESH_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        clear_refresh_cookie(response)
        raise HTTPException(401, {"error": "Недействительный refresh token"})
    stored = row_one(db, "SELECT * FROM refresh_tokens WHERE token=:token", {"token": token_hash(token)})
    if not stored or stored["expires_at"] < now_utc():
        clear_refresh_cookie(response)
        raise HTTPException(401, {"error": "Refresh token недействителен или истёк"})
    db.execute(text("DELETE FROM refresh_tokens WHERE id=:id"), {"id": stored["id"]})
    user = public_user(db, payload.get("userId"))
    if not user or not user["emailVerified"]:
        clear_refresh_cookie(response)
        raise HTTPException(401, {"error": "Email не подтверждён", "code": "EMAIL_NOT_VERIFIED"})
    access = make_access(user["id"])
    new_refresh = make_refresh(user["id"])
    save_refresh(db, new_refresh, user["id"])
    db.commit()
    set_refresh_cookie(response, new_refresh)
    return {"accessToken": access, "user": user}


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response, db: Session = Depends(db_session)):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        db.execute(text("DELETE FROM refresh_tokens WHERE token=:token"), {"token": token_hash(token)})
        db.commit()
    clear_refresh_cookie(response)
    return {"message": "Выход выполнен"}


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return {"user": user}


@app.get("/api/auth/check")
def check(username: str | None = None, email: str | None = None, db: Session = Depends(db_session)):
    result: dict[str, bool] = {}
    if username:
        result["usernameTaken"] = bool(scalar(db, "SELECT 1 FROM users WHERE username=:v", {"v": username.lower()}))
    if email:
        result["emailTaken"] = bool(scalar(db, "SELECT 1 FROM users WHERE email=:v", {"v": email.lower()}))
    return result


@app.get("/api/auth/check-user")
def check_user(login: str = "", db: Session = Depends(db_session)):
    if len(login.strip()) < 3:
        return {"exists": False}
    return {"exists": bool(scalar(db, "SELECT 1 FROM users WHERE username=:v OR email=:v", {"v": login.strip().lower()}))}


@app.post("/api/auth/verify-email")
async def verify_email(request: Request, db: Session = Depends(db_session)):
    data = await request.json()
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()
    user = row_one(db, "SELECT id FROM users WHERE email=:email", {"email": email})
    if not user:
        raise HTTPException(400, {"error": "Код подтверждения недействителен или истёк"})
    record = row_one(
        db,
        "SELECT * FROM account_tokens WHERE token_hash=:hash AND user_id=:user_id AND type='verify_email'",
        {"hash": token_hash(f"{user['id']}:{code}"), "user_id": user["id"]},
    )
    if not record or record["expires_at"] < now_utc():
        raise HTTPException(400, {"error": "Код подтверждения недействителен или истёк"})
    db.execute(text("UPDATE users SET email_verified=true, email_verified_at=:now, updated_at=:now WHERE id=:id"), {"id": user["id"], "now": now_utc()})
    db.execute(text("DELETE FROM account_tokens WHERE id=:id"), {"id": record["id"]})
    db.commit()
    return {"message": "Email подтверждён. Теперь можно войти."}


@app.post("/api/auth/resend-verification")
@app.post("/api/auth/forgot-password")
async def mail_stub():
    return {"message": "Если аккаунт найден, письмо будет отправлено после настройки почтового провайдера."}


@app.post("/api/auth/reset-password")
async def reset_password(request: Request, response: Response, db: Session = Depends(db_session)):
    data = await request.json()
    token = (data.get("token") or "").strip()
    password = data.get("password") or ""
    if len(password) < 6:
        raise HTTPException(400, {"error": "Пароль минимум 6 символов"})
    record = row_one(db, "SELECT * FROM account_tokens WHERE token_hash=:hash AND type='password_reset'", {"hash": token_hash(token)})
    if not record or record["expires_at"] < now_utc():
        raise HTTPException(400, {"error": "Ссылка восстановления недействительна или истекла"})
    db.execute(text("UPDATE users SET password_hash=:hash, email_verified=true, email_verified_at=COALESCE(email_verified_at, :now), updated_at=:now WHERE id=:id"), {"hash": pwd_context.hash(password), "now": now_utc(), "id": record["user_id"]})
    db.execute(text("DELETE FROM refresh_tokens WHERE user_id=:id"), {"id": record["user_id"]})
    db.execute(text("DELETE FROM account_tokens WHERE user_id=:id"), {"id": record["user_id"]})
    db.commit()
    clear_refresh_cookie(response)
    return {"message": "Пароль обновлён. Теперь можно войти."}


@app.get("/api/users/search")
def search_users(q: str = "", includeSelf: str = "", user=Depends(current_user), db: Session = Depends(db_session)):
    if not q.strip():
        return {"users": []}
    include_self = includeSelf.lower() in ["1", "true", "yes"]
    found = rows(
        db,
        """
        SELECT u.id, u.username, u.display_name AS "displayName", u.bio, u.avatar_url AS "avatarUrl",
               u.is_verified AS "isVerified", u.is_community AS "isCommunity", u.block_group_invites AS "blockGroupInvites",
               (SELECT COUNT(*) FROM follows f WHERE f.following_id=u.id) AS followers,
               (SELECT COUNT(*) FROM tweets t WHERE t.author_id=u.id) AS tweets
        FROM users u
        WHERE u.is_community=false AND (:include_self OR u.id<>:me)
          AND (u.username ILIKE :q OR u.display_name ILIKE :q OR COALESCE(u.bio,'') ILIKE :q)
        ORDER BY followers DESC, u.created_at DESC
        LIMIT 10
        """,
        {"q": f"%{q.strip()}%", "me": user["id"], "include_self": include_self},
    )
    for item in found:
        item["_count"] = {"followers": item.pop("followers"), "tweets": item.pop("tweets")}
    return {"users": clean(found)}


@app.get("/api/users/{username}")
def get_profile(username: str, viewer=Depends(optional_user), db: Session = Depends(db_session)):
    viewer_id = viewer["id"] if viewer else None
    profile = row_one(
        db,
        """
        SELECT u.id, u.username, u.display_name AS "displayName", u.bio, u.avatar_url AS "avatarUrl",
               u.banner_url AS "bannerUrl", u.birth_date AS "birthDate", u.is_verified AS "isVerified",
               u.is_community AS "isCommunity", u.block_group_invites AS "blockGroupInvites",
               u.message_privacy AS "messagePrivacy", u.notify_likes AS "notifyLikes",
               u.notify_replies AS "notifyReplies", u.notify_retweets AS "notifyRetweets",
               u.notify_follows AS "notifyFollows", u.notify_messages AS "notifyMessages",
               u.created_at AS "createdAt",
               (SELECT COUNT(*) FROM tweets t WHERE t.author_id=u.id) AS tweets,
               (SELECT COUNT(*) FROM follows f WHERE f.follower_id=u.id) AS following,
               (SELECT COUNT(*) FROM follows f WHERE f.following_id=u.id) AS followers
        FROM users u WHERE lower(u.username)=:username
        """,
        {"username": username.lower()},
    )
    if not profile:
        raise HTTPException(404, {"error": "Пользователь не найден"})
    profile["_count"] = {"tweets": profile.pop("tweets"), "following": profile.pop("following"), "followers": profile.pop("followers")}
    profile["isFollowing"] = bool(viewer_id and scalar(db, "SELECT 1 FROM follows WHERE follower_id=:f AND following_id=:t", {"f": viewer_id, "t": profile["id"]}))
    return {"user": clean(profile)}


@app.patch("/api/users/me/profile")
async def update_profile(
    request: Request,
    user=Depends(current_user),
    db: Session = Depends(db_session),
    avatar: UploadFile | None = File(None),
    banner: UploadFile | None = File(None),
):
    content_type = request.headers.get("content-type", "")
    data = dict(await request.form()) if "multipart/form-data" in content_type else await request.json()
    allowed = {
        "displayName": "display_name",
        "bio": "bio",
        "username": "username",
        "birthDate": "birth_date",
        "messagePrivacy": "message_privacy",
        "blockGroupInvites": "block_group_invites",
        "notifyLikes": "notify_likes",
        "notifyReplies": "notify_replies",
        "notifyRetweets": "notify_retweets",
        "notifyFollows": "notify_follows",
        "notifyMessages": "notify_messages",
    }
    updates = {}
    for api_name, column in allowed.items():
        if api_name in data:
            value = data[api_name]
            if api_name == "username":
                value = str(value).lower()
            if api_name.startswith("notify") or api_name == "blockGroupInvites":
                value = str(value).lower() in ["1", "true", "yes", "on"]
            updates[column] = value
    avatar_url = save_upload(avatar)
    banner_url = save_upload(banner)
    if avatar_url:
        updates["avatar_url"] = avatar_url
    if banner_url:
        updates["banner_url"] = banner_url
    if updates:
        assignments = ", ".join(f"{column}=:{column}" for column in updates)
        updates.update({"id": user["id"], "now": now_utc()})
        try:
            db.execute(text(f"UPDATE users SET {assignments}, updated_at=:now WHERE id=:id"), updates)
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, {"error": "Никнейм уже занят"})
    return {"user": public_user(db, user["id"])}


@app.post("/api/users/{target_id}/follow")
def follow_user(target_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    if target_id == user["id"]:
        raise HTTPException(400, {"error": "Нельзя подписаться на себя"})
    if not scalar(db, "SELECT 1 FROM users WHERE id=:id", {"id": target_id}):
        raise HTTPException(404, {"error": "Пользователь не найден"})
    existing = row_one(db, "SELECT id FROM follows WHERE follower_id=:f AND following_id=:t", {"f": user["id"], "t": target_id})
    if existing:
        db.execute(text("DELETE FROM follows WHERE id=:id"), {"id": existing["id"]})
        db.commit()
        return {"following": False}
    db.execute(text("INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (:id, :f, :t, :now)"), {"id": str(uuid.uuid4()), "f": user["id"], "t": target_id, "now": now_utc()})
    notify(db, target_id, user["id"], "follow")
    db.commit()
    return {"following": True}


@app.get("/api/users/{username}/tweets")
def user_tweets(username: str, tab: str = "tweets", viewer=Depends(optional_user), db: Session = Depends(db_session)):
    profile = row_one(db, "SELECT id FROM users WHERE username=:username", {"username": username.lower()})
    if not profile:
        raise HTTPException(404, {"error": "Пользователь не найден"})
    viewer_id = viewer["id"] if viewer else None
    if tab == "replies":
        tweets = tweet_list(db, "SELECT id FROM tweets WHERE author_id=:id AND parent_id IS NOT NULL ORDER BY created_at DESC LIMIT 30", {"id": profile["id"]}, viewer_id)
    else:
        tweets = tweet_list(db, "SELECT id FROM tweets WHERE author_id=:id AND parent_id IS NULL ORDER BY created_at DESC LIMIT 30", {"id": profile["id"]}, viewer_id)
    return {"tweets": clean(tweets)}


@app.get("/api/users/{username}/followers")
def followers(username: str, db: Session = Depends(db_session)):
    profile = row_one(db, "SELECT id FROM users WHERE username=:username", {"username": username.lower()})
    if not profile:
        raise HTTPException(404, {"error": "Не найден"})
    users = rows(db, 'SELECT u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.bio, u.is_community AS "isCommunity" FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.following_id=:id', {"id": profile["id"]})
    return {"users": clean(users)}


@app.get("/api/users/{username}/following")
def following(username: str, db: Session = Depends(db_session)):
    profile = row_one(db, "SELECT id FROM users WHERE username=:username", {"username": username.lower()})
    if not profile:
        raise HTTPException(404, {"error": "Не найден"})
    users = rows(db, 'SELECT u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.bio, u.is_community AS "isCommunity" FROM follows f JOIN users u ON u.id=f.following_id WHERE f.follower_id=:id', {"id": profile["id"]})
    return {"users": clean(users)}


@app.patch("/api/users/me/email")
async def update_email(request: Request, user=Depends(current_user)):
    return {"pendingEmail": (await request.json()).get("newEmail"), "emailSent": False, "message": "Смена email подготовлена. Почтовый провайдер не настроен."}


@app.post("/api/users/me/email/confirm")
async def confirm_email_update():
    return {"message": "Email изменён и подтверждён"}


@app.patch("/api/users/me/password")
async def update_password(request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    row = row_one(db, "SELECT password_hash FROM users WHERE id=:id", {"id": user["id"]})
    if not pwd_context.verify(data.get("currentPassword") or "", row["password_hash"]):
        raise HTTPException(401, {"error": "Неверный текущий пароль"})
    db.execute(text("UPDATE users SET password_hash=:hash, updated_at=:now WHERE id=:id"), {"hash": pwd_context.hash(data.get("newPassword") or ""), "now": now_utc(), "id": user["id"]})
    db.commit()
    return {"message": "Пароль изменён"}


@app.delete("/api/users/me")
async def delete_account(request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    row = row_one(db, "SELECT password_hash FROM users WHERE id=:id", {"id": user["id"]})
    if not pwd_context.verify(data.get("currentPassword") or "", row["password_hash"]):
        raise HTTPException(401, {"error": "Неверный текущий пароль"})
    db.execute(text("DELETE FROM users WHERE id=:id"), {"id": user["id"]})
    db.commit()
    return {"message": "Аккаунт удалён"}


@app.get("/api/tweets/feed")
def feed(cursor: str | None = None, limit: int = 20, mode: str = "all", viewer=Depends(optional_user), db: Session = Depends(db_session)):
    viewer_id = viewer["id"] if viewer else None
    params: dict[str, Any] = {"limit": min(limit, 50)}
    clause = "parent_id IS NULL"
    if cursor:
        clause += " AND created_at < :cursor"
        params["cursor"] = cursor
    if mode in ["following", "subscriptions"] and viewer_id:
        ids = [r["following_id"] for r in rows(db, "SELECT following_id FROM follows WHERE follower_id=:id", {"id": viewer_id})] + [viewer_id]
        clause += " AND author_id = ANY(:ids)"
        params["ids"] = ids
    tweets = tweet_list(db, f"SELECT id FROM tweets WHERE {clause} ORDER BY created_at DESC LIMIT :limit", params, viewer_id)
    next_cursor = tweets[-1]["createdAt"] if len(tweets) == params["limit"] else None
    return {"tweets": clean(tweets), "nextCursor": next_cursor}


@app.get("/api/tweets/explore")
def explore(q: str = "", topic: str = "", viewer=Depends(optional_user), db: Session = Depends(db_session)):
    viewer_id = viewer["id"] if viewer else None
    term = (q or topic).strip()
    if term:
        tweets = tweet_list(db, "SELECT id FROM tweets WHERE parent_id IS NULL AND content ILIKE :q ORDER BY views_count DESC, created_at DESC LIMIT 30", {"q": f"%{term}%"}, viewer_id)
    else:
        tweets = tweet_list(db, "SELECT id FROM tweets WHERE parent_id IS NULL ORDER BY views_count DESC, created_at DESC LIMIT 30", {}, viewer_id)
    users = rows(db, 'SELECT id, username, display_name AS "displayName", bio, avatar_url AS "avatarUrl", is_verified AS "isVerified", is_community AS "isCommunity" FROM users WHERE is_community=false ORDER BY created_at DESC LIMIT 8')
    communities = list_communities(q="", user=viewer, db=db)["communities"]
    return {"tweets": clean(tweets), "users": clean(users), "communities": communities, "trends": []}


@app.get("/api/tweets/search")
def search_tweets(q: str = "", viewer=Depends(optional_user), db: Session = Depends(db_session)):
    if not q.strip():
        return {"tweets": []}
    viewer_id = viewer["id"] if viewer else None
    return {"tweets": clean(tweet_list(db, "SELECT id FROM tweets WHERE content ILIKE :q ORDER BY views_count DESC, created_at DESC LIMIT 30", {"q": f"%{q.strip()}%"}, viewer_id))}


@app.get("/api/tweets/bookmarks")
def bookmarks(user=Depends(current_user), db: Session = Depends(db_session)):
    ids = rows(db, "SELECT tweet_id AS id, created_at FROM bookmarks WHERE user_id=:id ORDER BY created_at DESC LIMIT 50", {"id": user["id"]})
    tweets = []
    for item in ids:
        tw = tweet_payload(db, item["id"], user["id"])
        if tw:
            tw["bookmarkedAt"] = clean(item["created_at"])
            tweets.append(tw)
    return {"tweets": tweets, "nextCursor": None}


@app.get("/api/tweets/{tweet_id}")
def get_tweet(tweet_id: str, viewer=Depends(optional_user), db: Session = Depends(db_session)):
    tweet = tweet_payload(db, tweet_id, viewer["id"] if viewer else None, include_replies=True)
    if not tweet:
        raise HTTPException(404, {"error": "Твит не найден"})
    return {"tweet": clean(tweet)}


@app.post("/api/tweets", status_code=201)
async def create_tweet(request: Request, user=Depends(current_user), db: Session = Depends(db_session), image: UploadFile | None = File(None)):
    content_type = request.headers.get("content-type", "")
    data = dict(await request.form()) if "multipart/form-data" in content_type else await request.json()
    content = (data.get("content") or "").strip()
    if not content:
        raise HTTPException(400, {"error": "Твит 1-280 символов"})
    parent_id = data.get("parentId") or None
    community_id = data.get("communityId") or None
    tweet_id = str(uuid.uuid4())
    db.execute(
        text("INSERT INTO tweets (id, content, image_url, author_id, community_id, parent_id, views_count, created_at, updated_at) VALUES (:id, :content, :image, :author, :community, :parent, 0, :now, :now)"),
        {"id": tweet_id, "content": content[:280], "image": save_upload(image), "author": user["id"], "community": community_id, "parent": parent_id, "now": now_utc()},
    )
    if parent_id:
        parent = row_one(db, "SELECT author_id FROM tweets WHERE id=:id", {"id": parent_id})
        if parent:
            notify(db, parent["author_id"], user["id"], "reply", parent_id)
    db.commit()
    return {"tweet": clean(tweet_payload(db, tweet_id, user["id"]))}


@app.delete("/api/tweets/{tweet_id}")
def delete_tweet(tweet_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    owned = scalar(db, "SELECT 1 FROM tweets WHERE id=:id AND author_id=:user", {"id": tweet_id, "user": user["id"]})
    if not owned:
        raise HTTPException(403, {"error": "Нет прав"})
    db.execute(text("DELETE FROM tweets WHERE id=:id"), {"id": tweet_id})
    db.commit()
    return {"message": "Твит удалён"}


def toggle_link(db: Session, table: str, user_id: str, tweet_id: str) -> bool:
    existing = row_one(db, f"SELECT id FROM {table} WHERE user_id=:user AND tweet_id=:tweet", {"user": user_id, "tweet": tweet_id})
    if existing:
        db.execute(text(f"DELETE FROM {table} WHERE id=:id"), {"id": existing["id"]})
        return False
    db.execute(text(f"INSERT INTO {table} (id, user_id, tweet_id, created_at) VALUES (:id, :user, :tweet, :now)"), {"id": str(uuid.uuid4()), "user": user_id, "tweet": tweet_id, "now": now_utc()})
    return True


@app.post("/api/tweets/{tweet_id}/like")
def like(tweet_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    tw = row_one(db, "SELECT author_id FROM tweets WHERE id=:id", {"id": tweet_id})
    if not tw:
        raise HTTPException(404, {"error": "Твит не найден"})
    liked = toggle_link(db, "likes", user["id"], tweet_id)
    if liked:
        notify(db, tw["author_id"], user["id"], "like", tweet_id)
    db.commit()
    return {"liked": liked}


@app.post("/api/tweets/{tweet_id}/retweet")
def retweet(tweet_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    tw = row_one(db, "SELECT author_id FROM tweets WHERE id=:id", {"id": tweet_id})
    if not tw:
        raise HTTPException(404, {"error": "Твит не найден"})
    retweeted = toggle_link(db, "retweets", user["id"], tweet_id)
    if retweeted:
        notify(db, tw["author_id"], user["id"], "retweet", tweet_id)
    db.commit()
    return {"retweeted": retweeted}


@app.post("/api/tweets/{tweet_id}/bookmark")
def bookmark(tweet_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    if not scalar(db, "SELECT 1 FROM tweets WHERE id=:id", {"id": tweet_id}):
        raise HTTPException(404, {"error": "Твит не найден"})
    bookmarked = toggle_link(db, "bookmarks", user["id"], tweet_id)
    db.commit()
    return {"bookmarked": bookmarked}


def normalize_community(db: Session, item: dict[str, Any], user_id: str | None):
    members = scalar(db, "SELECT COUNT(*) FROM community_members WHERE community_id=:id", {"id": item["id"]})
    tweets = scalar(db, "SELECT COUNT(*) FROM tweets WHERE community_id=:id", {"id": item["id"]})
    role = None
    if user_id:
        role = scalar(db, "SELECT role FROM community_members WHERE community_id=:c AND user_id=:u", {"c": item["id"], "u": user_id})
    item["username"] = item["slug"]
    item["displayName"] = item["name"]
    item["isCommunity"] = True
    item["isMember"] = bool(role)
    item["memberRole"] = role
    item["_count"] = {"followers": members, "tweets": tweets, "members": members}
    return clean(item)


@app.get("/api/communities")
def list_communities(q: str = "", user=Depends(optional_user), db: Session = Depends(db_session)):
    items = rows(db, 'SELECT id, slug, name, bio, avatar_url AS "avatarUrl", banner_url AS "bannerUrl", owner_id AS "ownerId", is_verified AS "isVerified", created_at AS "createdAt" FROM communities WHERE (:q = \'\' OR slug ILIKE :like OR name ILIKE :like OR COALESCE(bio, \'\') ILIKE :like) ORDER BY created_at DESC LIMIT 20', {"q": q.strip(), "like": f"%{q.strip()}%"})
    return {"communities": [normalize_community(db, item, user["id"] if user else None) for item in items]}


@app.get("/api/communities/mine")
def my_communities(user=Depends(current_user), db: Session = Depends(db_session)):
    items = rows(db, 'SELECT c.id, c.slug, c.name, c.bio, c.avatar_url AS "avatarUrl", c.banner_url AS "bannerUrl", c.owner_id AS "ownerId", c.is_verified AS "isVerified", c.created_at AS "createdAt" FROM communities c JOIN community_members m ON m.community_id=c.id WHERE m.user_id=:u AND m.role IN (\'owner\', \'admin\') ORDER BY c.created_at DESC', {"u": user["id"]})
    return {"communities": [normalize_community(db, item, user["id"]) for item in items]}


@app.post("/api/communities", status_code=201)
async def create_community(request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    community_id = str(uuid.uuid4())
    slug = (data.get("slug") or "").strip().lower()
    name = (data.get("name") or "").strip()
    if len(slug) < 3 or len(name) < 2:
        raise HTTPException(400, {"error": "Название и адрес обязательны"})
    try:
        db.execute(text("INSERT INTO communities (id, slug, name, bio, owner_id, is_verified, created_at, updated_at) VALUES (:id, :slug, :name, :bio, :owner, false, :now, :now)"), {"id": community_id, "slug": slug, "name": name, "bio": data.get("bio"), "owner": user["id"], "now": now_utc()})
        db.execute(text("INSERT INTO community_members (id, community_id, user_id, role, created_at) VALUES (:id, :c, :u, 'owner', :now)"), {"id": str(uuid.uuid4()), "c": community_id, "u": user["id"], "now": now_utc()})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, {"error": "Адрес сообщества уже занят"})
    item = row_one(db, 'SELECT id, slug, name, bio, avatar_url AS "avatarUrl", banner_url AS "bannerUrl", owner_id AS "ownerId", is_verified AS "isVerified", created_at AS "createdAt" FROM communities WHERE id=:id', {"id": community_id})
    return {"community": normalize_community(db, item, user["id"])}


@app.get("/api/communities/{slug}")
def get_community(slug: str, user=Depends(optional_user), db: Session = Depends(db_session)):
    item = row_one(db, 'SELECT id, slug, name, bio, avatar_url AS "avatarUrl", banner_url AS "bannerUrl", owner_id AS "ownerId", is_verified AS "isVerified", created_at AS "createdAt" FROM communities WHERE slug=:slug', {"slug": slug.lower()})
    if not item:
        raise HTTPException(404, {"error": "Сообщество не найдено"})
    return {"community": normalize_community(db, item, user["id"] if user else None)}


@app.get("/api/communities/{slug}/tweets")
def community_tweets(slug: str, user=Depends(optional_user), db: Session = Depends(db_session)):
    community = row_one(db, "SELECT id FROM communities WHERE slug=:slug", {"slug": slug.lower()})
    if not community:
        raise HTTPException(404, {"error": "Сообщество не найдено"})
    return {"tweets": clean(tweet_list(db, "SELECT id FROM tweets WHERE community_id=:id AND parent_id IS NULL ORDER BY created_at DESC LIMIT 30", {"id": community["id"]}, user["id"] if user else None))}


@app.post("/api/communities/{slug}/join")
def join_community(slug: str, user=Depends(current_user), db: Session = Depends(db_session)):
    community = row_one(db, "SELECT id, owner_id FROM communities WHERE slug=:slug", {"slug": slug.lower()})
    if not community:
        raise HTTPException(404, {"error": "Сообщество не найдено"})
    existing = row_one(db, "SELECT id FROM community_members WHERE community_id=:c AND user_id=:u", {"c": community["id"], "u": user["id"]})
    if existing and community["owner_id"] != user["id"]:
        db.execute(text("DELETE FROM community_members WHERE id=:id"), {"id": existing["id"]})
        db.commit()
        return {"member": False}
    if not existing:
        db.execute(text("INSERT INTO community_members (id, community_id, user_id, role, created_at) VALUES (:id, :c, :u, 'member', :now)"), {"id": str(uuid.uuid4()), "c": community["id"], "u": user["id"], "now": now_utc()})
        db.commit()
    return {"member": True}


@app.get("/api/communities/{slug}/members")
def community_members(slug: str, user=Depends(current_user), db: Session = Depends(db_session)):
    community = row_one(db, "SELECT id, owner_id FROM communities WHERE slug=:slug", {"slug": slug.lower()})
    if not community or community["owner_id"] != user["id"]:
        raise HTTPException(403, {"error": "Управлять сообществом может только владелец"})
    members = rows(db, 'SELECT u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.is_verified AS "isVerified", m.role, m.created_at AS "joinedAt" FROM community_members m JOIN users u ON u.id=m.user_id WHERE m.community_id=:id ORDER BY m.created_at ASC', {"id": community["id"]})
    return {"members": clean(members)}


@app.patch("/api/communities/{slug}")
async def update_community(slug: str, request: Request, user=Depends(current_user), db: Session = Depends(db_session), avatar: UploadFile | None = File(None), banner: UploadFile | None = File(None)):
    community = row_one(db, "SELECT id, owner_id FROM communities WHERE slug=:slug", {"slug": slug.lower()})
    if not community or community["owner_id"] != user["id"]:
        raise HTTPException(403, {"error": "Управлять сообществом может только владелец"})
    data = dict(await request.form()) if "multipart/form-data" in request.headers.get("content-type", "") else await request.json()
    updates = {}
    if "name" in data:
        updates["name"] = data["name"]
    if "bio" in data:
        updates["bio"] = data["bio"] or None
    avatar_url = save_upload(avatar)
    banner_url = save_upload(banner)
    if avatar_url:
        updates["avatar_url"] = avatar_url
    if banner_url:
        updates["banner_url"] = banner_url
    if updates:
        updates.update({"id": community["id"], "now": now_utc()})
        db.execute(text(f"UPDATE communities SET {', '.join(f'{k}=:{k}' for k in updates if k not in ['id','now'])}, updated_at=:now WHERE id=:id"), updates)
        db.commit()
    return get_community(slug, user, db)


@app.post("/api/communities/{slug}/members")
async def add_members(slug: str, request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    community = row_one(db, "SELECT id, owner_id FROM communities WHERE slug=:slug", {"slug": slug.lower()})
    if not community or community["owner_id"] != user["id"]:
        raise HTTPException(403, {"error": "Управлять сообществом может только владелец"})
    for user_id in set((await request.json()).get("userIds") or []):
        try:
            db.execute(text("INSERT INTO community_members (id, community_id, user_id, role, created_at) VALUES (:id, :c, :u, 'member', :now)"), {"id": str(uuid.uuid4()), "c": community["id"], "u": user_id, "now": now_utc()})
        except IntegrityError:
            db.rollback()
    db.commit()
    return get_community(slug, user, db)


@app.delete("/api/communities/{slug}/members/{target_user_id}")
def remove_member(slug: str, target_user_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    community = row_one(db, "SELECT id, owner_id FROM communities WHERE slug=:slug", {"slug": slug.lower()})
    if not community or community["owner_id"] != user["id"]:
        raise HTTPException(403, {"error": "Управлять сообществом может только владелец"})
    db.execute(text("DELETE FROM community_members WHERE community_id=:c AND user_id=:u AND role<>'owner'"), {"c": community["id"], "u": target_user_id})
    db.commit()
    return get_community(slug, user, db)


@app.delete("/api/communities/{slug}")
def delete_community(slug: str, user=Depends(current_user), db: Session = Depends(db_session)):
    community = row_one(db, "SELECT id, owner_id FROM communities WHERE slug=:slug", {"slug": slug.lower()})
    if not community or community["owner_id"] != user["id"]:
        raise HTTPException(403, {"error": "Управлять сообществом может только владелец"})
    db.execute(text("DELETE FROM communities WHERE id=:id"), {"id": community["id"]})
    db.commit()
    return {"slug": slug}


@app.get("/api/notifications")
def notifications(user=Depends(current_user), db: Session = Depends(db_session)):
    items = rows(db, 'SELECT n.id, n.type, n.tweet_id AS "tweetId", n.is_read AS "isRead", n.created_at AS "createdAt", u.id AS "from_id", u.username AS "from_username", u.display_name AS "from_displayName", u.avatar_url AS "from_avatarUrl", u.is_verified AS "from_isVerified" FROM notifications n JOIN users u ON u.id=n.from_id WHERE n.user_id=:id ORDER BY n.created_at DESC LIMIT 60', {"id": user["id"]})
    for item in items:
        item["from"] = {"id": item.pop("from_id"), "username": item.pop("from_username"), "displayName": item.pop("from_displayName"), "avatarUrl": item.pop("from_avatarUrl"), "isVerified": item.pop("from_isVerified")}
    unread = scalar(db, "SELECT COUNT(*) FROM notifications WHERE user_id=:id AND is_read=false", {"id": user["id"]})
    return {"notifications": clean(items), "unreadCount": unread}


@app.patch("/api/notifications")
def mark_notifications(user=Depends(current_user), db: Session = Depends(db_session)):
    result = db.execute(text("UPDATE notifications SET is_read=true WHERE user_id=:id AND is_read=false"), {"id": user["id"]})
    db.commit()
    return {"message": "Уведомления прочитаны", "updated": result.rowcount}


@app.patch("/api/notifications/{notification_id}/read")
def mark_notification(notification_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    db.execute(text("UPDATE notifications SET is_read=true WHERE id=:id AND user_id=:u"), {"id": notification_id, "u": user["id"]})
    db.commit()
    return {"notification": row_one(db, "SELECT * FROM notifications WHERE id=:id", {"id": notification_id})}


def note_obj(db: Session, note_id: str):
    note = row_one(db, 'SELECT id, content, color, pinned, created_at AS "createdAt", updated_at AS "updatedAt" FROM quick_notes WHERE id=:id', {"id": note_id})
    if note:
        note["history"] = rows(db, 'SELECT id, summary, created_at AS "createdAt" FROM quick_note_history WHERE note_id=:id ORDER BY created_at DESC LIMIT 5', {"id": note_id})
    return clean(note)


@app.get("/api/services/notes")
def list_notes(user=Depends(current_user), db: Session = Depends(db_session)):
    ids = rows(db, "SELECT id FROM quick_notes WHERE user_id=:id ORDER BY pinned DESC, updated_at DESC LIMIT 50", {"id": user["id"]})
    return {"notes": [note_obj(db, item["id"]) for item in ids]}


@app.get("/api/services/notes/history")
def note_history(user=Depends(current_user), db: Session = Depends(db_session)):
    history = rows(db, 'SELECT h.id, h.summary, h.created_at AS "createdAt", n.id AS "note_id", n.content AS "note_content", n.color AS "note_color" FROM quick_note_history h JOIN quick_notes n ON n.id=h.note_id WHERE n.user_id=:id ORDER BY h.created_at DESC LIMIT 100', {"id": user["id"]})
    for item in history:
        item["note"] = {"id": item.pop("note_id"), "content": item.pop("note_content"), "color": item.pop("note_color")}
    return {"history": clean(history)}


@app.post("/api/services/notes", status_code=201)
async def create_note(request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    note_id = str(uuid.uuid4())
    db.execute(text("INSERT INTO quick_notes (id, user_id, content, color, pinned, created_at, updated_at) VALUES (:id, :u, :content, :color, false, :now, :now)"), {"id": note_id, "u": user["id"], "content": (data.get("content") or "").strip(), "color": data.get("color") or "cyan", "now": now_utc()})
    db.commit()
    return {"note": note_obj(db, note_id)}


@app.patch("/api/services/notes/{note_id}")
async def update_note(note_id: str, request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    existing = row_one(db, "SELECT * FROM quick_notes WHERE id=:id AND user_id=:u", {"id": note_id, "u": user["id"]})
    if not existing:
        raise HTTPException(404, {"error": "Заметка не найдена"})
    updates = {k: v for k, v in {"content": data.get("content"), "color": data.get("color"), "pinned": data.get("pinned")}.items() if v is not None}
    if updates:
        updates.update({"id": note_id, "now": now_utc()})
        db.execute(text(f"UPDATE quick_notes SET {', '.join(f'{k}=:{k}' for k in updates if k not in ['id','now'])}, updated_at=:now WHERE id=:id"), updates)
        db.execute(text("INSERT INTO quick_note_history (id, note_id, summary, created_at) VALUES (:id, :note, :summary, :now)"), {"id": str(uuid.uuid4()), "note": note_id, "summary": "изменена заметка", "now": now_utc()})
        db.commit()
    return {"note": note_obj(db, note_id)}


@app.delete("/api/services/notes/{note_id}")
def delete_note(note_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    db.execute(text("DELETE FROM quick_notes WHERE id=:id AND user_id=:u"), {"id": note_id, "u": user["id"]})
    db.commit()
    return {"noteId": note_id}


@app.get("/api/services/tasks")
def list_tasks(user=Depends(current_user), db: Session = Depends(db_session)):
    tasks = rows(db, 'SELECT id, title, details, status, priority, due_date AS "dueDate", created_at AS "createdAt", updated_at AS "updatedAt" FROM service_tasks WHERE user_id=:id ORDER BY status ASC, due_date ASC, updated_at DESC LIMIT 100', {"id": user["id"]})
    return {"tasks": clean(tasks)}


@app.post("/api/services/tasks", status_code=201)
async def create_task(request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    task_id = str(uuid.uuid4())
    db.execute(text("INSERT INTO service_tasks (id, user_id, title, details, status, priority, due_date, created_at, updated_at) VALUES (:id, :u, :title, :details, :status, :priority, :due, :now, :now)"), {"id": task_id, "u": user["id"], "title": data.get("title"), "details": data.get("details"), "status": data.get("status") or "todo", "priority": data.get("priority") or "normal", "due": data.get("dueDate") or None, "now": now_utc()})
    db.commit()
    return {"task": rows(db, 'SELECT id, title, details, status, priority, due_date AS "dueDate", created_at AS "createdAt", updated_at AS "updatedAt" FROM service_tasks WHERE id=:id', {"id": task_id})[0]}


@app.patch("/api/services/tasks/{task_id}")
async def update_task(task_id: str, request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    updates = {k: v for k, v in {"title": data.get("title"), "details": data.get("details"), "status": data.get("status"), "priority": data.get("priority"), "due_date": data.get("dueDate")}.items() if v is not None}
    if updates:
        updates.update({"id": task_id, "u": user["id"], "now": now_utc()})
        db.execute(text(f"UPDATE service_tasks SET {', '.join(f'{k}=:{k}' for k in updates if k not in ['id','u','now'])}, updated_at=:now WHERE id=:id AND user_id=:u"), updates)
        db.commit()
    return {"task": rows(db, 'SELECT id, title, details, status, priority, due_date AS "dueDate", created_at AS "createdAt", updated_at AS "updatedAt" FROM service_tasks WHERE id=:id', {"id": task_id})[0]}


@app.delete("/api/services/tasks/{task_id}")
def delete_task(task_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    db.execute(text("DELETE FROM service_tasks WHERE id=:id AND user_id=:u"), {"id": task_id, "u": user["id"]})
    db.commit()
    return {"taskId": task_id}


@app.get("/api/services/weather")
def weather(city: str = "Moscow", lat: float | None = None, lon: float | None = None, user=Depends(optional_user)):
    try:
        if lat is None or lon is None:
            geo = requests.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": city, "count": 1, "language": "ru", "format": "json"},
                timeout=(3, 5),
            ).json()
            place = (geo.get("results") or [None])[0]
            if not place:
                return fallback_weather(city=city, reason="city_not_found")
            lat, lon, city, country = place["latitude"], place["longitude"], place["name"], place.get("country", "")
        else:
            country = ""

        forecast = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
                "hourly": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability",
                "daily": "temperature_2m_max,temperature_2m_min,weather_code",
                "forecast_days": 5,
                "timezone": "auto",
            },
            timeout=(3, 5),
        ).json()
        current = forecast.get("current") or {}
        hourly = forecast.get("hourly") or {}
        daily = forecast.get("daily") or {}
        return {
            "city": city,
            "country": country,
            "latitude": lat,
            "longitude": lon,
            "timezone": forecast.get("timezone"),
            "fallback": False,
            "current": {
                "temperature": round(current.get("temperature_2m", 0)),
                "feelsLike": round(current.get("apparent_temperature", current.get("temperature_2m", 0))),
                "humidity": current.get("relative_humidity_2m", 0),
                "windSpeed": round(current.get("wind_speed_10m", 0)),
                "code": current.get("weather_code", 0),
                "label": weather_label(current.get("weather_code"), current.get("temperature_2m")),
            },
            "hourly": [
                {
                    "time": hour,
                    "temperature": round((hourly.get("temperature_2m") or [0])[i]),
                    "feelsLike": round((hourly.get("apparent_temperature") or hourly.get("temperature_2m") or [0])[i]),
                    "humidity": (hourly.get("relative_humidity_2m") or [0])[i],
                    "windSpeed": round((hourly.get("wind_speed_10m") or [0])[i]),
                    "precipitationProbability": (hourly.get("precipitation_probability") or [0])[i],
                    "code": (hourly.get("weather_code") or [0])[i],
                    "label": weather_label(
                        (hourly.get("weather_code") or [0])[i],
                        (hourly.get("temperature_2m") or [None])[i],
                    ),
                }
                for i, hour in enumerate(hourly.get("time") or [])
            ],
            "daily": [
                {
                    "day": day,
                    "min": round((daily.get("temperature_2m_min") or [0])[i]),
                    "max": round((daily.get("temperature_2m_max") or [0])[i]),
                    "code": (daily.get("weather_code") or [0])[i],
                    "label": weather_label(
                        (daily.get("weather_code") or [0])[i],
                        ((daily.get("temperature_2m_min") or [0])[i] + (daily.get("temperature_2m_max") or [0])[i]) / 2,
                    ),
                }
                for i, day in enumerate(daily.get("time") or [])
            ],
        }
    except (RequestException, KeyError, ValueError, TypeError) as error:
        return fallback_weather(city=city, lat=lat, lon=lon, reason=error.__class__.__name__)


def music_search_response(q: str = "", limit: int = 24):
    return {
        "tracks": [],
        "source": "muffon",
        "message": "Музыка теперь обслуживается Node backend через muffon.",
    }


@app.get("/api/music/search")
def music_search_get(q: str = "", limit: int = 24, user=Depends(current_user)):
    return music_search_response(q, limit)


@app.post("/api/music/search")
async def music_search_post(request: Request, user=Depends(current_user)):
    body = await request.json()
    return music_search_response(str(body.get("q", "")), int(body.get("limit") or 24))


def chat_payload(db: Session, chat_id: str, user_id: str):
    chat = row_one(db, 'SELECT id, name, description, avatar_url AS "avatarUrl", owner_id AS "ownerId", is_group AS "isGroup", updated_at AS "updatedAt" FROM chats WHERE id=:id', {"id": chat_id})
    if not chat:
        return None
    participants = rows(db, 'SELECT u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.is_verified AS "isVerified" FROM chat_participants p JOIN users u ON u.id=p.user_id WHERE p.chat_id=:id', {"id": chat_id})
    last = row_one(db, 'SELECT m.id, m.content, m.image_url AS "imageUrl", m.created_at AS "createdAt", u.id AS "sender_id", u.username AS "sender_username", u.display_name AS "sender_displayName" FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.chat_id=:id ORDER BY m.created_at DESC LIMIT 1', {"id": chat_id})
    if last:
        last["sender"] = {"id": last.pop("sender_id"), "username": last.pop("sender_username"), "displayName": last.pop("sender_displayName")}
    chat["participants"] = participants
    chat["lastMessage"] = clean(last)
    chat["unreadCount"] = scalar(db, "SELECT COUNT(*) FROM messages WHERE chat_id=:c AND sender_id<>:u AND is_read=false", {"c": chat_id, "u": user_id})
    chat["otherUser"] = None if chat["isGroup"] else next((p for p in participants if p["id"] != user_id), None)
    return clean(chat)


def is_chat_participant(db: Session, chat_id: str, user_id: str) -> bool:
    return bool(scalar(db, "SELECT 1 FROM chat_participants WHERE chat_id=:c AND user_id=:u", {"c": chat_id, "u": user_id}))


def message_payload(db: Session, message_id: str) -> dict[str, Any] | None:
    item = row_one(
        db,
        'SELECT m.id, m.chat_id AS "chatId", m.sender_id AS "senderId", m.receiver_id AS "receiverId", m.content, m.image_url AS "imageUrl", m.is_read AS "isRead", m.created_at AS "createdAt", m.edited_at AS "editedAt", u.id AS "u_id", u.username AS "u_username", u.display_name AS "u_displayName", u.avatar_url AS "u_avatarUrl" FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=:id',
        {"id": message_id},
    )
    if not item:
        return None
    item["sender"] = {
        "id": item.pop("u_id"),
        "username": item.pop("u_username"),
        "displayName": item.pop("u_displayName"),
        "avatarUrl": item.pop("u_avatarUrl"),
    }
    item["reactions"] = rows(
        db,
        'SELECT r.id, r.message_id AS "messageId", r.user_id AS "userId", r.emoji, r.created_at AS "createdAt", u.id AS "u_id", u.username AS "u_username", u.display_name AS "u_displayName" FROM message_reactions r JOIN users u ON u.id=r.user_id WHERE r.message_id=:id ORDER BY r.created_at ASC',
        {"id": message_id},
    )
    for reaction in item["reactions"]:
        reaction["user"] = {"id": reaction.pop("u_id"), "username": reaction.pop("u_username"), "displayName": reaction.pop("u_displayName")}
    return clean(item)


def create_chat_message(db: Session, chat_id: str, sender_id: str, content: str, image_url: str | None = None) -> dict[str, Any]:
    if not is_chat_participant(db, chat_id, sender_id):
        raise HTTPException(403, {"error": "Нет доступа к чату"})
    content = (content or "").strip()
    if not content and not image_url:
        raise HTTPException(400, {"error": "Сообщение не может быть пустым"})
    message_id = str(uuid.uuid4())
    receiver_id = scalar(db, "SELECT user_id FROM chat_participants WHERE chat_id=:c AND user_id<>:u LIMIT 1", {"c": chat_id, "u": sender_id})
    db.execute(
        text("INSERT INTO messages (id, chat_id, sender_id, receiver_id, content, image_url, is_read, created_at) VALUES (:id, :chat, :sender, :receiver, :content, :image, false, :now)"),
        {"id": message_id, "chat": chat_id, "sender": sender_id, "receiver": receiver_id, "content": content, "image": image_url, "now": now_utc()},
    )
    db.execute(text("UPDATE chats SET updated_at=:now WHERE id=:id"), {"id": chat_id, "now": now_utc()})
    db.commit()
    message = message_payload(db, message_id)
    if not message:
        raise HTTPException(500, {"error": "Сообщение не создано"})
    return message


def format_call_duration(started_at: datetime | None) -> str:
    if not started_at:
        return "00:00"
    seconds = max(0, int((now_utc() - started_at).total_seconds()))
    minutes, rest = divmod(seconds, 60)
    return f"{minutes:02d}:{rest:02d}"


async def emit_chat_message(db: Session, chat_id: str, message: dict[str, Any], sender_id: str | None = None):
    await sio.emit("message:new", {"chatId": chat_id, "message": message}, room=f"chat:{chat_id}")
    for participant in rows(db, "SELECT user_id FROM chat_participants WHERE chat_id=:c", {"c": chat_id}):
        chat = chat_payload(db, chat_id, participant["user_id"])
        await sio.emit("chat:updated", {"chatId": chat_id, "chat": chat}, room=f"user:{participant['user_id']}")


@app.get("/api/chats")
def chats(user=Depends(current_user), db: Session = Depends(db_session)):
    ids = rows(db, "SELECT c.id FROM chats c JOIN chat_participants p ON p.chat_id=c.id WHERE p.user_id=:u ORDER BY c.updated_at DESC", {"u": user["id"]})
    return {"chats": [chat_payload(db, item["id"], user["id"]) for item in ids]}


@app.post("/api/chats", status_code=201)
async def create_chat(request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    target = (await request.json()).get("targetUserId")
    existing = row_one(db, "SELECT c.id FROM chats c JOIN chat_participants p1 ON p1.chat_id=c.id AND p1.user_id=:u JOIN chat_participants p2 ON p2.chat_id=c.id AND p2.user_id=:t WHERE c.is_group=false LIMIT 1", {"u": user["id"], "t": target})
    if existing:
        return {"chat": chat_payload(db, existing["id"], user["id"]), "created": False}
    chat_id = str(uuid.uuid4())
    db.execute(text("INSERT INTO chats (id, is_group, created_at, updated_at) VALUES (:id, false, :now, :now)"), {"id": chat_id, "now": now_utc()})
    for uid in [user["id"], target]:
        db.execute(text("INSERT INTO chat_participants (id, chat_id, user_id, joined_at) VALUES (:id, :c, :u, :now)"), {"id": str(uuid.uuid4()), "c": chat_id, "u": uid, "now": now_utc()})
    db.commit()
    return {"chat": chat_payload(db, chat_id, user["id"]), "created": True}


@app.post("/api/chats/groups", status_code=201)
async def create_group(request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    chat_id = str(uuid.uuid4())
    db.execute(text("INSERT INTO chats (id, name, owner_id, is_group, created_at, updated_at) VALUES (:id, :name, :owner, true, :now, :now)"), {"id": chat_id, "name": data.get("name"), "owner": user["id"], "now": now_utc()})
    for uid in set((data.get("participantIds") or []) + [user["id"]]):
        db.execute(text("INSERT INTO chat_participants (id, chat_id, user_id, joined_at) VALUES (:id, :c, :u, :now)"), {"id": str(uuid.uuid4()), "c": chat_id, "u": uid, "now": now_utc()})
    db.commit()
    return {"chat": chat_payload(db, chat_id, user["id"])}


@app.get("/api/chats/{chat_id}/messages")
def messages(chat_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    if not is_chat_participant(db, chat_id, user["id"]):
        raise HTTPException(403, {"error": "Нет доступа к чату"})
    ids = rows(db, "SELECT id FROM messages WHERE chat_id=:id ORDER BY created_at ASC LIMIT 100", {"id": chat_id})
    items = [message_payload(db, item["id"]) for item in ids]
    return {"messages": clean(items)}


@app.post("/api/chats/{chat_id}/messages", status_code=201)
async def send_message(request: Request, chat_id: str, user=Depends(current_user), db: Session = Depends(db_session), image: UploadFile | None = File(None)):
    data = dict(await request.form()) if "multipart/form-data" in request.headers.get("content-type", "") else await request.json()
    return {"message": create_chat_message(db, chat_id, user["id"], data.get("content") or "", save_upload(image))}


@app.patch("/api/chats/{chat_id}/messages/{message_id}")
async def edit_message(chat_id: str, message_id: str, request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    db.execute(text("UPDATE messages SET content=:content, edited_at=:now WHERE id=:id AND sender_id=:u"), {"content": (data.get("content") or "").strip(), "now": now_utc(), "id": message_id, "u": user["id"]})
    db.commit()
    message = message_payload(db, message_id)
    if not message:
        raise HTTPException(404, {"error": "Сообщение не найдено"})
    return {"message": message}


@app.delete("/api/chats/{chat_id}/messages/{message_id}")
def delete_message(chat_id: str, message_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    db.execute(text("DELETE FROM messages WHERE id=:id AND sender_id=:u"), {"id": message_id, "u": user["id"]})
    db.commit()
    return {"messageId": message_id}


@app.post("/api/chats/{chat_id}/messages/{message_id}/reactions")
async def reactions(chat_id: str, message_id: str, request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    data = await request.json()
    emoji = (data.get("emoji") or "").strip()[:16]
    if not emoji:
        raise HTTPException(400, {"error": "Выберите реакцию"})
    if not is_chat_participant(db, chat_id, user["id"]):
        raise HTTPException(403, {"error": "Нет доступа к чату"})
    existing = row_one(db, "SELECT id FROM message_reactions WHERE message_id=:m AND user_id=:u AND emoji=:e", {"m": message_id, "u": user["id"], "e": emoji})
    if existing:
        db.execute(text("DELETE FROM message_reactions WHERE id=:id"), {"id": existing["id"]})
    else:
        db.execute(text("INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (:id, :m, :u, :e, :now)"), {"id": str(uuid.uuid4()), "m": message_id, "u": user["id"], "e": emoji, "now": now_utc()})
    db.commit()
    message = message_payload(db, message_id)
    await sio.emit("message:updated", {"chatId": chat_id, "message": message}, room=f"chat:{chat_id}")
    return {"message": message}


@app.patch("/api/chats/{chat_id}/group")
async def update_group(chat_id: str, request: Request, user=Depends(current_user), db: Session = Depends(db_session), avatar: UploadFile | None = File(None)):
    data = dict(await request.form()) if "multipart/form-data" in request.headers.get("content-type", "") else await request.json()
    updates = {k: v for k, v in {"name": data.get("name"), "description": data.get("description"), "avatar_url": save_upload(avatar)}.items() if v}
    if updates:
        updates.update({"id": chat_id, "now": now_utc()})
        updates["owner"] = user["id"]
        db.execute(text(f"UPDATE chats SET {', '.join(f'{k}=:{k}' for k in updates if k not in ['id','now','owner'])}, updated_at=:now WHERE id=:id AND owner_id=:owner"), updates)
        db.commit()
    return {"chat": chat_payload(db, chat_id, user["id"])}


@app.post("/api/chats/{chat_id}/group/participants")
async def add_group_participants(chat_id: str, request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
    for uid in set((await request.json()).get("participantIds") or []):
        try:
            db.execute(text("INSERT INTO chat_participants (id, chat_id, user_id, joined_at) VALUES (:id, :c, :u, :now)"), {"id": str(uuid.uuid4()), "c": chat_id, "u": uid, "now": now_utc()})
        except IntegrityError:
            db.rollback()
    db.commit()
    return {"chat": chat_payload(db, chat_id, user["id"])}


@app.delete("/api/chats/{chat_id}/group/participants/{target_user_id}")
def remove_group_participant(chat_id: str, target_user_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    db.execute(text("DELETE FROM chat_participants WHERE chat_id=:c AND user_id=:u"), {"c": chat_id, "u": target_user_id})
    db.commit()
    return {"chat": chat_payload(db, chat_id, user["id"])}


@app.delete("/api/chats/{chat_id}/group")
def delete_group(chat_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
    db.execute(text("DELETE FROM chats WHERE id=:id AND owner_id=:u"), {"id": chat_id, "u": user["id"]})
    db.commit()
    return {"chatId": chat_id}


@sio.event
async def connect(sid, environ, auth):
    token = (auth or {}).get("token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return False
    await sio.save_session(sid, {"user_id": payload.get("userId")})
    await sio.enter_room(sid, f"user:{payload.get('userId')}")
    await sio.emit("user:online", {"userId": payload.get("userId")}, skip_sid=sid)


@sio.event
async def disconnect(sid):
    try:
        session = await sio.get_session(sid)
    except KeyError:
        return
    if session.get("user_id"):
        await sio.emit("user:offline", {"userId": session.get("user_id")}, skip_sid=sid)


def event_chat_id(data) -> str | None:
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        return data.get("chatId")
    return None


@sio.on("chat:join")
async def socket_join_chat(sid, data):
    chat_id = event_chat_id(data)
    if chat_id:
        await sio.enter_room(sid, f"chat:{chat_id}")


@sio.on("chat:leave")
async def socket_leave_chat(sid, data):
    chat_id = event_chat_id(data)
    if chat_id:
        await sio.leave_room(sid, f"chat:{chat_id}")


@sio.on("typing:start")
async def socket_typing_start(sid, data):
    session = await sio.get_session(sid)
    chat_id = event_chat_id(data)
    if chat_id:
        await sio.emit("typing:start", {"chatId": chat_id, "userId": session.get("user_id")}, room=f"chat:{chat_id}", skip_sid=sid)


@sio.on("typing:stop")
async def socket_typing_stop(sid, data):
    session = await sio.get_session(sid)
    chat_id = event_chat_id(data)
    if chat_id:
        await sio.emit("typing:stop", {"chatId": chat_id, "userId": session.get("user_id")}, room=f"chat:{chat_id}", skip_sid=sid)


@sio.on("messages:read")
async def socket_messages_read(sid, data):
    session = await sio.get_session(sid)
    chat_id = event_chat_id(data)
    if not chat_id:
        return
    with SessionLocal() as db:
        db.execute(text("UPDATE messages SET is_read=true WHERE chat_id=:c AND sender_id<>:u"), {"c": chat_id, "u": session.get("user_id")})
        db.commit()


@sio.on("message:send")
async def socket_message_send(sid, data):
    session = await sio.get_session(sid)
    chat_id = data.get("chatId") if isinstance(data, dict) else None
    if not chat_id:
        return
    with SessionLocal() as db:
        try:
            message = create_chat_message(db, chat_id, session.get("user_id"), data.get("content") or "")
            chat = chat_payload(db, chat_id, session.get("user_id"))
        except HTTPException as error:
            await sio.emit("message:error", api_error(error), to=sid)
            return
        await sio.emit("message:new", {"chatId": chat_id, "message": message}, room=f"chat:{chat_id}")
        participant_ids = rows(db, "SELECT user_id FROM chat_participants WHERE chat_id=:c", {"c": chat_id})
        for participant in participant_ids:
            await sio.emit("chat:updated", {"chatId": chat_id, "chat": chat}, room=f"user:{participant['user_id']}")
            if participant["user_id"] != session.get("user_id"):
                await sio.emit("chat:notification", {"chatId": chat_id, "message": message}, room=f"user:{participant['user_id']}")


def user_brief(db: Session, user_id: str | None):
    if not user_id:
        return None
    return row_one(db, 'SELECT id, username, display_name AS "displayName", avatar_url AS "avatarUrl" FROM users WHERE id=:id', {"id": user_id})


@sio.on("call:start")
async def socket_call_start(sid, data):
    session = await sio.get_session(sid)
    chat_id = data.get("chatId") if isinstance(data, dict) else None
    if not chat_id:
        return
    with SessionLocal() as db:
        if not is_chat_participant(db, chat_id, session.get("user_id")):
            return
        call = {
            "id": str(uuid.uuid4()),
            "chatId": chat_id,
            "mode": data.get("mode") or "audio",
            "caller": user_brief(db, session.get("user_id")),
            "startedAt": now_utc().isoformat(),
        }
        started_at = now_utc()
        message = create_chat_message(db, chat_id, session.get("user_id"), f"Звонок начался {started_at.strftime('%H:%M')}")
        call["messageId"] = message["id"]
        active_calls[call["id"]] = call
        await sio.enter_room(sid, f"call:{call['id']}")
        await emit_chat_message(db, chat_id, message, session.get("user_id"))
        await sio.emit("call:started", {"call": call}, to=sid)
        await sio.emit("call:ring", {"call": call}, room=f"chat:{chat_id}", skip_sid=sid)


@sio.on("call:join")
async def socket_call_join(sid, data):
    session = await sio.get_session(sid)
    call = active_calls.get(data.get("callId")) if isinstance(data, dict) else None
    if not call:
        return
    with SessionLocal() as db:
        user = user_brief(db, session.get("user_id"))
    await sio.enter_room(sid, f"call:{call['id']}")
    await sio.emit("call:peer-joined", {"call": call, "user": user}, room=f"call:{call['id']}", skip_sid=sid)


@sio.on("call:reject")
async def socket_call_reject(sid, data):
    call_id = data.get("callId") if isinstance(data, dict) else None
    call = active_calls.pop(call_id, None)
    if call:
        with SessionLocal() as db:
            message_id = call.get("messageId")
            started_at = datetime.fromisoformat(call["startedAt"]) if call.get("startedAt") else None
            if message_id:
                content = f"Звонок сброшен · {format_call_duration(started_at)}"
                db.execute(text("UPDATE messages SET content=:content, edited_at=:now WHERE id=:id"), {"content": content, "now": now_utc(), "id": message_id})
                db.commit()
                message = message_payload(db, message_id)
                await sio.emit("message:updated", {"chatId": call["chatId"], "message": message}, room=f"chat:{call['chatId']}")
        await sio.emit("call:rejected", {"callId": call_id}, room=f"chat:{call['chatId']}")


@sio.on("call:end")
async def socket_call_end(sid, data):
    call_id = data.get("callId") if isinstance(data, dict) else None
    call = active_calls.pop(call_id, None)
    room = f"call:{call_id}" if call_id else None
    if call:
        with SessionLocal() as db:
            message_id = call.get("messageId")
            started_at = datetime.fromisoformat(call["startedAt"]) if call.get("startedAt") else None
            if message_id:
                content = f"Звонок завершён · {format_call_duration(started_at)}"
                db.execute(text("UPDATE messages SET content=:content, edited_at=:now WHERE id=:id"), {"content": content, "now": now_utc(), "id": message_id})
                db.commit()
                message = message_payload(db, message_id)
                await sio.emit("message:updated", {"chatId": call["chatId"], "message": message}, room=f"chat:{call['chatId']}")
    if room:
        await sio.emit("call:ended", {"callId": call_id}, room=room)
    if call:
        await sio.emit("call:ended", {"callId": call_id}, room=f"chat:{call['chatId']}")


@sio.on("call:signal")
async def socket_call_signal(sid, data):
    session = await sio.get_session(sid)
    target_id = data.get("targetUserId") if isinstance(data, dict) else None
    if not target_id:
        return
    with SessionLocal() as db:
        sender = user_brief(db, session.get("user_id"))
    await sio.emit(
        "call:signal",
        {"callId": data.get("callId"), "chatId": data.get("chatId"), "from": sender, "signal": data.get("signal")},
        room=f"user:{target_id}",
    )
