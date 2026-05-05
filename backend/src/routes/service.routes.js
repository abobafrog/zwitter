const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
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
} = require('../controllers/service.controller');

router.use(authenticate);

router.get('/weather', getWeather);

router.get('/notes', listNotes);
router.get('/notes/history', listNoteHistory);
router.post(
  '/notes',
  [body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Заметка 1-1000 символов')],
  validate,
  createNote
);
router.patch('/notes/:noteId', updateNote);
router.delete('/notes/:noteId', deleteNote);

router.get('/tasks', listTasks);
router.post(
  '/tasks',
  [body('title').trim().isLength({ min: 1, max: 160 }).withMessage('Название задачи 1-160 символов')],
  validate,
  createTask
);
router.patch('/tasks/:taskId', updateTask);
router.delete('/tasks/:taskId', deleteTask);

module.exports = router;
