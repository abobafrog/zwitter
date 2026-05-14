# 🐦 Twitter Clone (X Prototype)

Полноценный прототип Twitter/X с регистрацией, лентой твитов и чатами в реальном времени.

## 🏗️ Стек технологий

| Слой | Технологии |
|------|-----------|
| **Frontend** | React 18, Vite, TailwindCSS, Zustand, React Query, Socket.IO Client |
| **Backend** | Python, FastAPI, python-socketio, SQLAlchemy |
| **База данных** | PostgreSQL |
| **Хранилище файлов** | Локальные загрузки `/uploads` |
| **Безопасность** | JWT (access + refresh tokens), bcrypt |
| **Деплой** | Docker, Vercel (фронт), Railway/Render/Fly.io (бэк) |

## 📋 Функциональность

### ✅ Реализовано
- **Аутентификация**: регистрация, вход, выход, JWT refresh tokens
- **Профиль**: просмотр профиля, аватар, bio, подписки/подписчики
- **Твиты**: публикация, лайки, ретвиты, удаление, изображения, бесконечная лента
- **Сообщения**: список чатов, реальные сообщения через Socket.IO, индикатор печати, непрочитанные
- **Безопасность**: rate limiting, валидация входных данных, helmet, CORS
- **Логирование**: Winston с файловыми и консольными транспортами

---

## 🚀 Быстрый старт на localhost

### Вариант 1: Docker Compose (рекомендуется)

```bash
# 1. Клонировать или распаковать проект
cd zwitter

# 2. Заполнить Cloudinary (опционально, нужно для загрузки фото)
# Создайте .env в корне:
# CLOUDINARY_CLOUD_NAME=xxx
# CLOUDINARY_API_KEY=xxx
# CLOUDINARY_API_SECRET=xxx

# 3. Запустить всё одной командой.
# Backend контейнер сам поднимет Node API и встроенный muffon-api.
docker compose up --build

# 4. Перейти
# Frontend: http://localhost
# Backend API: http://localhost:5001
```

`muffon-api` лежит внутри `backend/muffon-api` и запускается в backend-контейнере на `127.0.0.1:4000`.
Основной backend ходит к нему через `MUFFON_API_URL=http://127.0.0.1:4000/api`.

### Вариант 2: Ручной запуск

#### 1. PostgreSQL
```bash
# Установите PostgreSQL или используйте Docker:
docker run -d \
  --name twitter_db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=twitter_clone \
  -p 5432:5432 \
  postgres:15-alpine
```

#### 2. Backend
```bash
cd backend

# Установить зависимости
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt

# Создать .env (скопировать из .env.example и заполнить)
cp .env.example .env
# Отредактируйте .env файл!

# Запустить dev сервер
uvicorn app.main:socket_app --host 0.0.0.0 --port 5000 --reload
```

#### 3. Frontend
```bash
cd frontend

# Установить зависимости
npm install

# Создать .env
cp .env.example .env
# VITE_API_URL=http://localhost:5000
# VITE_SOCKET_URL=http://localhost:5000

# Запустить
npm run dev
```

Откройте: **http://localhost:3000**

Тестовые пользователи (после seed):
- `alice` / `password123`
- `bob` / `password123`

---

## 🌐 Деплой в production

### Backend: Railway

```bash
# 1. Создать аккаунт на railway.app
# 2. Создать новый проект → Deploy from GitHub
# 3. Добавить PostgreSQL плагин
# 4. Установить переменные окружения:
DATABASE_URL=<из Railway PostgreSQL>
JWT_SECRET=<случайная строка 32+ символов>
JWT_REFRESH_SECRET=<другая случайная строка>
FRONTEND_URL=https://your-app.vercel.app
PORT=5000
```

### Backend: Render

```bash
# 1. render.com → New Web Service
# 2. Connect GitHub repo
# 3. Root Directory: backend
# 4. Build Command: pip install -r requirements.txt
# 5. Start Command: uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT
# 6. Добавить PostgreSQL (Render → New PostgreSQL)
# 7. Заполнить Environment Variables
```

### Backend: Fly.io

```bash
# Установить flyctl
curl -L https://fly.io/install.sh | sh

cd backend
fly launch
fly postgres create
fly postgres attach <db-name>
fly secrets set JWT_SECRET="..." JWT_REFRESH_SECRET="..."
fly deploy
```

### Frontend: Vercel

```bash
# 1. vercel.com → Import Git Repository
# 2. Framework: Vite
# 3. Root Directory: frontend
# 4. Environment Variables:
VITE_API_URL=https://your-backend.railway.app
VITE_SOCKET_URL=https://your-backend.railway.app

# Или через CLI:
npm install -g vercel
cd frontend
vercel --prod
```

---

## 🖥️ Деплой на собственный VPS

```bash
# 1. Установить Docker на сервер
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y

# 2. Скопировать проект на сервер
scp -r zwitter user@your-vps:/opt/zwitter

# 3. Создать .env файл с реальными данными
cd /opt/zwitter
nano .env

# 4. Запустить
docker compose -f docker-compose.yml up -d --build

# 5. Настроить Nginx reverse proxy (опционально)
# Или использовать Traefik для HTTPS
```

---

## 📡 API Endpoints

### Auth
| Метод | URL | Описание |
|-------|-----|----------|
| POST | /api/auth/register | Регистрация |
| POST | /api/auth/login | Вход |
| POST | /api/auth/refresh | Обновить токен |
| POST | /api/auth/logout | Выход |
| GET | /api/auth/me | Текущий пользователь |

### Tweets
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/tweets/feed | Лента твитов |
| POST | /api/tweets | Создать твит |
| GET | /api/tweets/:id | Получить твит |
| DELETE | /api/tweets/:id | Удалить твит |
| POST | /api/tweets/:id/like | Лайк/анлайк |
| POST | /api/tweets/:id/retweet | Ретвит |

### Chats
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/chats | Список чатов |
| POST | /api/chats | Создать/открыть чат |
| GET | /api/chats/:id/messages | Сообщения чата |
| POST | /api/chats/:id/messages | Отправить сообщение |

### Users
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/users/search?q= | Поиск пользователей |
| GET | /api/users/:username | Профиль пользователя |
| PATCH | /api/users/me/profile | Обновить профиль |
| POST | /api/users/:id/follow | Подписаться/отписаться |

---

## 🔌 Socket.IO Events

### Клиент → Сервер
- `chat:join` (chatId) — войти в комнату чата
- `chat:leave` (chatId) — покинуть комнату
- `message:send` ({chatId, content, imageUrl}) — отправить сообщение
- `typing:start` ({chatId}) — начал печатать
- `typing:stop` ({chatId}) — перестал печатать
- `messages:read` ({chatId}) — пометить как прочитанные

### Сервер → Клиент
- `message:new` ({message, chatId}) — новое сообщение
- `chat:notification` ({chatId, message, from}) — уведомление
- `typing:start` ({chatId, userId, user}) — кто-то печатает
- `typing:stop` ({chatId, userId}) — перестал печатать
- `messages:read` ({chatId, readBy}) — прочитано
- `user:online` ({userId}) — пользователь онлайн
- `user:offline` ({userId}) — пользователь офлайн

---

## 🔒 Безопасность

- JWT access токены (15 мин) + refresh токены (7 дней) с ротацией
- Хэширование паролей bcrypt (salt rounds: 12)
- Rate limiting: 10 попыток входа / 15 мин, 10 твитов / мин
- Helmet.js для HTTP заголовков безопасности
- Валидация всех входных данных через express-validator
- CORS настроен только на разрешённые origins

---

## 📁 Структура проекта

```
twitter-clone/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI + Socket.IO точка входа
│   │   └── schema.sql         # PostgreSQL схема
│   ├── prisma/                # Legacy-схема старого Node-бэкенда
│   ├── src/                   # Legacy Node-бэкенд, Docker его не запускает
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/          # TweetCard, TweetComposer
│   │   │   └── layout/        # Layout, Sidebar, RightPanel
│   │   ├── hooks/             # useSocket
│   │   ├── pages/             # Login, Register, Home, Chats, Profile
│   │   ├── services/          # api.js (axios), socket.js
│   │   ├── store/             # authStore, chatStore (Zustand)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
└── README.md
```
