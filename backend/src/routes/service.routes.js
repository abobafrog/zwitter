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
  listAnonymousQuestions,
  sendAnonymousQuestion,
  answerAnonymousQuestion,
} = require('../controllers/service.controller');

router.get('/weather', getWeather);

router.use(authenticate);

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

router.get('/anonymous-questions', listAnonymousQuestions);
router.post(
  '/anonymous-questions/send',
  [
    body('targetUsername').trim().isLength({ min: 1, max: 50 }).withMessage('Укажите получателя'),
    body('question').trim().isLength({ min: 1, max: 500 }).withMessage('Вопрос 1-500 символов'),
  ],
  validate,
  sendAnonymousQuestion
);
router.patch(
  '/anonymous-questions/:questionId',
  [body('answer').trim().isLength({ min: 1, max: 1000 }).withMessage('Ответ 1-1000 символов')],
  validate,
  answerAnonymousQuestion
);

module.exports = router;
