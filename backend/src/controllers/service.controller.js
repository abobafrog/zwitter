const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/prisma');

const noteSelect = {
  id: true,
  content: true,
  color: true,
  pinned: true,
  createdAt: true,
  updatedAt: true,
  history: {
    select: { id: true, summary: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  },
};

const allowedNoteColors = ['cyan', 'violet', 'emerald', 'amber', 'rose'];
const taskStatuses = ['todo', 'doing', 'done'];
const taskPriorities = ['low', 'normal', 'high'];

const taskSelect = {
  id: true,
  title: true,
  details: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
};

const anonymousQuestionsPath = path.join(__dirname, '../../data/anonymous-questions.json');

const readAnonymousQuestions = async () => {
  try {
    const raw = await fs.readFile(anonymousQuestionsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const writeAnonymousQuestions = async (items) => {
  await fs.mkdir(path.dirname(anonymousQuestionsPath), { recursive: true });
  await fs.writeFile(anonymousQuestionsPath, JSON.stringify(items, null, 2), 'utf8');
};

const buildNoteHistorySummary = (existing, data) => {
  const changes = [];
  if (data.content !== undefined && data.content !== existing.content) changes.push('изменён текст');
  if (data.color !== undefined && data.color !== existing.color) changes.push(`цвет ${existing.color} → ${data.color}`);
  if (data.pinned !== undefined && data.pinned !== existing.pinned) changes.push(data.pinned ? 'закреплено' : 'откреплено');
  return changes.join(', ');
};

const listNotes = async (req, res, next) => {
  try {
    const notes = await prisma.quickNote.findMany({
      where: { userId: req.user.id },
      select: noteSelect,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: 50,
    });
    res.json({ notes });
  } catch (error) {
    next(error);
  }
};

const listNoteHistory = async (req, res, next) => {
  try {
    const history = await prisma.quickNoteHistory.findMany({
      where: { note: { userId: req.user.id } },
      select: {
        id: true,
        summary: true,
        createdAt: true,
        note: { select: { id: true, content: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ history });
  } catch (error) {
    next(error);
  }
};

const createNote = async (req, res, next) => {
  try {
    const content = req.body.content?.trim();
    const color = allowedNoteColors.includes(req.body.color) ? req.body.color : 'cyan';
    if (!content) return res.status(400).json({ error: 'Заметка не может быть пустой' });
    if (content.length > 1000) return res.status(400).json({ error: 'Заметка до 1000 символов' });

    const note = await prisma.quickNote.create({
      data: { userId: req.user.id, content, color },
      select: noteSelect,
    });
    res.status(201).json({ note });
  } catch (error) {
    next(error);
  }
};

const updateNote = async (req, res, next) => {
  try {
    const { noteId } = req.params;
    const data = {};
    if (req.body.content !== undefined) {
      const content = req.body.content.trim();
      if (!content) return res.status(400).json({ error: 'Заметка не может быть пустой' });
      if (content.length > 1000) return res.status(400).json({ error: 'Заметка до 1000 символов' });
      data.content = content;
    }
    if (req.body.color !== undefined && allowedNoteColors.includes(req.body.color)) data.color = req.body.color;
    if (req.body.pinned !== undefined) data.pinned = Boolean(req.body.pinned);

    const existing = await prisma.quickNote.findFirst({
      where: { id: noteId, userId: req.user.id },
      select: { id: true, content: true, color: true, pinned: true },
    });
    if (!existing) return res.status(404).json({ error: 'Заметка не найдена' });

    const summary = buildNoteHistorySummary(existing, data);
    const note = await prisma.$transaction(async (tx) => {
      const updated = await tx.quickNote.update({
        where: { id: noteId },
        data,
        select: noteSelect,
      });
      if (summary) {
        await tx.quickNoteHistory.create({ data: { noteId, summary } });
        return tx.quickNote.findUnique({ where: { id: noteId }, select: noteSelect });
      }
      return updated;
    });

    res.json({ note });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Заметка не найдена' });
    next(error);
  }
};

const deleteNote = async (req, res, next) => {
  try {
    const deleted = await prisma.quickNote.deleteMany({ where: { id: req.params.noteId, userId: req.user.id } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Заметка не найдена' });
    res.json({ noteId: req.params.noteId });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Заметка не найдена' });
    next(error);
  }
};

const listTasks = async (req, res, next) => {
  try {
    const tasks = await prisma.serviceTask.findMany({
      where: { userId: req.user.id },
      select: taskSelect,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
      take: 100,
    });
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
};

const createTask = async (req, res, next) => {
  try {
    const title = req.body.title?.trim();
    if (!title) return res.status(400).json({ error: 'Название задачи обязательно' });
    if (title.length > 160) return res.status(400).json({ error: 'Название до 160 символов' });
    const status = taskStatuses.includes(req.body.status) ? req.body.status : 'todo';
    const priority = taskPriorities.includes(req.body.priority) ? req.body.priority : 'normal';
    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;

    const task = await prisma.serviceTask.create({
      data: {
        userId: req.user.id,
        title,
        details: req.body.details?.trim() || null,
        status,
        priority,
        dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      },
      select: taskSelect,
    });
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
};

const updateTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const data = {};
    if (req.body.title !== undefined) {
      const title = req.body.title.trim();
      if (!title) return res.status(400).json({ error: 'Название задачи обязательно' });
      if (title.length > 160) return res.status(400).json({ error: 'Название до 160 символов' });
      data.title = title;
    }
    if (req.body.details !== undefined) data.details = req.body.details?.trim() || null;
    if (req.body.status !== undefined && taskStatuses.includes(req.body.status)) data.status = req.body.status;
    if (req.body.priority !== undefined && taskPriorities.includes(req.body.priority)) data.priority = req.body.priority;
    if (req.body.dueDate !== undefined) {
      const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      data.dueDate = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null;
    }

    const existing = await prisma.serviceTask.findFirst({ where: { id: taskId, userId: req.user.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Задача не найдена' });
    const task = await prisma.serviceTask.update({ where: { id: taskId }, data, select: taskSelect });
    res.json({ task });
  } catch (error) {
    next(error);
  }
};

const deleteTask = async (req, res, next) => {
  try {
    const deleted = await prisma.serviceTask.deleteMany({ where: { id: req.params.taskId, userId: req.user.id } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Задача не найдена' });
    res.json({ taskId: req.params.taskId });
  } catch (error) {
    next(error);
  }
};

const listAnonymousQuestions = async (req, res, next) => {
  try {
    const items = await readAnonymousQuestions();
    const questions = items
      .filter((item) => item.targetUserId === req.user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(({ fromUserId, ...item }) => item);
    res.json({ questions });
  } catch (error) {
    next(error);
  }
};

const sendAnonymousQuestion = async (req, res, next) => {
  try {
    const targetUsername = req.body.targetUsername?.trim().toLowerCase();
    const question = req.body.question?.trim();
    if (!targetUsername) return res.status(400).json({ error: 'Укажите получателя' });
    if (!question) return res.status(400).json({ error: 'Вопрос не может быть пустым' });
    if (question.length > 500) return res.status(400).json({ error: 'Вопрос до 500 символов' });

    const target = await prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true, username: true, displayName: true, isCommunity: true },
    });
    if (!target || target.isCommunity) return res.status(404).json({ error: 'Получатель не найден' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Нельзя отправить анонимный вопрос себе' });

    const items = await readAnonymousQuestions();
    const nextQuestion = {
      id: crypto.randomUUID(),
      targetUserId: target.id,
      targetUsername: target.username,
      targetDisplayName: target.displayName,
      fromUserId: req.user.id,
      question,
      answer: '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      answeredAt: null,
    };
    items.push(nextQuestion);
    await writeAnonymousQuestions(items);
    res.status(201).json({ question: nextQuestion });
  } catch (error) {
    next(error);
  }
};

const answerAnonymousQuestion = async (req, res, next) => {
  try {
    const answer = req.body.answer?.trim();
    if (!answer) return res.status(400).json({ error: 'Ответ не может быть пустым' });
    if (answer.length > 1000) return res.status(400).json({ error: 'Ответ до 1000 символов' });

    const items = await readAnonymousQuestions();
    const index = items.findIndex((item) => item.id === req.params.questionId && item.targetUserId === req.user.id);
    if (index === -1) return res.status(404).json({ error: 'Вопрос не найден' });

    items[index] = {
      ...items[index],
      answer,
      status: 'answered',
      answeredAt: new Date().toISOString(),
    };
    await writeAnonymousQuestions(items);
    const { fromUserId, ...question } = items[index];
    res.json({ question });
  } catch (error) {
    next(error);
  }
};

const weatherCodeText = (code, temperature = null) => {
  if ([51, 53, 55, 61, 63, 65, 80, 81].includes(code) && Number.isFinite(temperature) && temperature <= 2) return 'Слякоть';
  if (code === 0) return 'Ясно';
  if (code === 1) return 'Преимущественно ясно';
  if (code === 2) return 'Переменная облачность';
  if (code === 3) return 'Пасмурно';
  if (code === 45) return 'Туман';
  if (code === 48) return 'Инейный туман';
  if (code === 51) return 'Лёгкая морось';
  if (code === 53) return 'Морось';
  if (code === 55) return 'Сильная морось';
  if (code === 56) return 'Ледяная морось';
  if (code === 57) return 'Сильная ледяная морось';
  if (code === 61) return 'Небольшой дождь';
  if (code === 63) return 'Дождь';
  if (code === 65) return 'Сильный дождь';
  if (code === 66) return 'Ледяной дождь';
  if (code === 67) return 'Сильный ледяной дождь';
  if (code === 71) return 'Лёгкий снег';
  if (code === 73) return 'Снег';
  if (code === 75) return 'Снегопад';
  if (code === 77) return 'Снежная крупа';
  if (code === 80) return 'Кратковременный дождь';
  if (code === 81) return 'Ливень';
  if (code === 82) return 'Сильный ливень';
  if (code === 85) return 'Снежный заряд';
  if (code === 86) return 'Сильный снегопад';
  if (code === 95) return 'Гроза';
  if (code === 96) return 'Гроза с градом';
  if (code === 99) return 'Сильная гроза с градом';
  return 'Погода';
};

const getWeather = async (req, res, next) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);
    let place = null;

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      place = { name: 'Ваше место', country: '', latitude, longitude };
    } else {
      const city = (req.query.city || 'Moscow').toString().trim().slice(0, 80);
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`;
      const geo = await fetch(geoUrl).then((response) => response.json());
      place = geo.results?.[0];
      if (!place) return res.status(404).json({ error: 'Город не найден' });
    }

    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.set('latitude', place.latitude);
    forecastUrl.searchParams.set('longitude', place.longitude);
    forecastUrl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m');
    forecastUrl.searchParams.set('hourly', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability');
    forecastUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code');
    forecastUrl.searchParams.set('forecast_days', '5');
    forecastUrl.searchParams.set('timezone', 'auto');
    const forecast = await fetch(forecastUrl).then((response) => response.json());

    res.json({
      city: place.name,
      country: place.country || '',
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: forecast.timezone,
      current: {
        temperature: Math.round(forecast.current.temperature_2m),
        feelsLike: Math.round(forecast.current.apparent_temperature),
        humidity: forecast.current.relative_humidity_2m,
        windSpeed: Math.round(forecast.current.wind_speed_10m),
        code: forecast.current.weather_code,
        label: weatherCodeText(forecast.current.weather_code, forecast.current.temperature_2m),
      },
      hourly: (forecast.hourly?.time || []).map((time, index) => {
        const temperature = forecast.hourly.temperature_2m?.[index] ?? null;
        const code = forecast.hourly.weather_code?.[index] ?? 0;
        return {
          time,
          temperature: Number.isFinite(temperature) ? Math.round(temperature) : null,
          feelsLike: Math.round(forecast.hourly.apparent_temperature?.[index] ?? temperature ?? 0),
          humidity: forecast.hourly.relative_humidity_2m?.[index] ?? null,
          windSpeed: Math.round(forecast.hourly.wind_speed_10m?.[index] ?? 0),
          precipitationProbability: forecast.hourly.precipitation_probability?.[index] ?? null,
          code,
          label: weatherCodeText(code, temperature),
        };
      }),
      daily: (forecast.daily.time || []).map((day, index) => ({
        day,
        min: Math.round(forecast.daily.temperature_2m_min[index]),
        max: Math.round(forecast.daily.temperature_2m_max[index]),
        code: forecast.daily.weather_code[index],
        label: weatherCodeText(
          forecast.daily.weather_code[index],
          (forecast.daily.temperature_2m_min[index] + forecast.daily.temperature_2m_max[index]) / 2
        ),
      })),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listNotes,
  listNoteHistory,
  createNote,
  updateNote,
  deleteNote,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  getWeather,
  listAnonymousQuestions,
  sendAnonymousQuestion,
  answerAnonymousQuestion,
};
