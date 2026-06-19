const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const Note = require('../models/Note');

const router = express.Router();

// Imágenes incrustadas en las notas. Viven en disco (gitignored) y se
// referencian desde el markdown como ![](/api/notes/uploads/xxx.png).
const NOTES_DIR = path.join(__dirname, '../../storage/notes');
fs.mkdirSync(NOTES_DIR, { recursive: true });

const ALLOWED_IMAGE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: NOTES_DIR,
    filename: (req, file, cb) =>
      cb(null, crypto.randomUUID() + (ALLOWED_IMAGE[file.mimetype] || '')),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    ALLOWED_IMAGE[file.mimetype]
      ? cb(null, true)
      : cb(new Error('Solo se aceptan imágenes PNG, JPG, GIF o WEBP')),
});

// Servir las imágenes ya subidas (la cookie de sesión viaja en el <img>).
router.use('/uploads', express.static(NOTES_DIR, { immutable: true, maxAge: '30d' }));

// Subir una imagen y obtener su URL para insertarla en el markdown.
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
  res.status(201).json({ url: `/api/notes/uploads/${req.file.filename}` });
});

// Nombres de fichero referenciados en el markdown de una nota.
function imagesIn(content) {
  const out = [];
  const re = /\/api\/notes\/uploads\/([\w.-]+)/g;
  let m;
  while ((m = re.exec(content || ''))) out.push(m[1]);
  return out;
}

// /api/notes?q=texto para buscar; sin q devuelve todas (el cliente monta el árbol)
router.get('/', async (req, res) => {
  const { q } = req.query;
  if (q) {
    return res.json(await Note.find({ $text: { $search: q } }).sort({ updatedAt: -1 }).limit(100));
  }
  res.json(await Note.find().sort({ order: 1, createdAt: 1 }));
});

router.get('/:id', async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
  res.json(note);
});

router.post('/', async (req, res) => {
  try {
    const { title, content, tags, parentId, icon, order } = req.body;
    if (parentId && !(await Note.exists({ _id: parentId }))) {
      return res.status(400).json({ error: 'parentId no corresponde a ninguna nota' });
    }
    const note = await Note.create({
      title: title || '',
      content: content || '',
      tags: tags || [],
      parentId: parentId || null,
      icon: icon || '',
      order: order || 0,
    });
    res.status(201).json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Comprueba que moviendo `id` bajo `parentId` no se crea un ciclo.
async function createsCycle(id, parentId) {
  let cursor = parentId;
  while (cursor) {
    if (String(cursor) === String(id)) return true;
    const parent = await Note.findById(cursor).select('parentId');
    cursor = parent ? parent.parentId : null;
  }
  return false;
}

router.patch('/:id', async (req, res) => {
  try {
    const update = {};
    for (const key of ['title', 'content', 'tags', 'parentId', 'icon', 'order']) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (update.parentId) {
      if (!(await Note.exists({ _id: update.parentId }))) {
        return res.status(400).json({ error: 'parentId no corresponde a ninguna nota' });
      }
      if (await createsCycle(req.params.id, update.parentId)) {
        return res.status(400).json({ error: 'No puedes mover una página dentro de sí misma' });
      }
    }
    const note = await Note.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Borra la página y todas sus subpáginas.
router.delete('/:id', async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
  const toDelete = [note._id];
  let frontier = [note._id];
  while (frontier.length) {
    const children = await Note.find({ parentId: { $in: frontier } }).select('_id');
    frontier = children.map((c) => c._id);
    toDelete.push(...frontier);
  }
  // Imágenes candidatas a borrar: las que estaban en las notas eliminadas.
  const deletedNotes = await Note.find({ _id: { $in: toDelete } }).select('content');
  const candidates = new Set(deletedNotes.flatMap((n) => imagesIn(n.content)));

  await Note.deleteMany({ _id: { $in: toDelete } });

  // Borra del disco solo las que ya no referencia ninguna nota viva.
  if (candidates.size) {
    const survivors = await Note.find({ content: { $regex: '/api/notes/uploads/' } }).select('content');
    const used = new Set(survivors.flatMap((n) => imagesIn(n.content)));
    for (const file of candidates) {
      if (!used.has(file)) fs.promises.unlink(path.join(NOTES_DIR, file)).catch(() => {});
    }
  }

  res.json({ ok: true, deleted: toDelete.length });
});

module.exports = router;
