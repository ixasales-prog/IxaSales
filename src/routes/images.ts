import { Elysia, t } from 'elysia';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const CACHE_DIR = path.join(process.cwd(), 'uploads', '.cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export const imageRoutes = new Elysia({ prefix: '/images' })
    .get('/*', async ({ params, query, set }) => {
        const filePathParam = params['*']; // Capture the rest of the path
        if (!filePathParam) {
            set.status = 404;
            return 'File not provided';
        }

        // Prevent directory traversal
        const safePath = path.normalize(filePathParam).replace(/^(\.\.[\/\\])+/, '');
        const originalFilePath = path.join(UPLOADS_DIR, safePath);

        if (!fs.existsSync(originalFilePath)) {
            set.status = 404;
            return 'Image not found';
        }

        const width = query.w ? parseInt(query.w) : null;
        const height = query.h ? parseInt(query.h) : null;
        const quality = query.q ? parseInt(query.q) : 80;

        // If no resizing needed, redirect to original static file (nginx/elysia static handles it better)
        // BUT, since we are here, we might as well serve it to avoid redirect loop if client insists on this route.
        // Or, we only optimize if parameters are present.
        if (!width && !height) {
            const file = Bun.file(originalFilePath);
            return file;
        }

        // Generate cache key
        const cacheKey = `${safePath.replace(/[\/\\]/g, '_')}_w${width || 'auto'}_h${height || 'auto'}_q${quality}`;
        const cacheFilePath = path.join(CACHE_DIR, cacheKey + path.extname(originalFilePath));

        // Check cache
        if (fs.existsSync(cacheFilePath)) {
            // Check if original is newer than cache
            const originalStats = fs.statSync(originalFilePath);
            const cacheStats = fs.statSync(cacheFilePath);

            if (cacheStats.mtime >= originalStats.mtime) {
                return Bun.file(cacheFilePath);
            }
        }

        try {
            const transformer = sharp(originalFilePath);

            if (width || height) {
                transformer.resize(width, height, {
                    fit: 'cover',
                    withoutEnlargement: true
                });
            }

            // Auto-format or keep format? Let's keep format but optimize
            const ext = path.extname(originalFilePath).toLowerCase();
            if (ext === '.jpg' || ext === '.jpeg') {
                transformer.jpeg({ quality });
            } else if (ext === '.png') {
                transformer.png({ quality });
            } else if (ext === '.webp') {
                transformer.webp({ quality });
            }

            await transformer.toFile(cacheFilePath);
            return Bun.file(cacheFilePath);

        } catch (error) {
            console.error('Image optimization error:', error);
            set.status = 500;
            return 'Error processing image';
        }
    }, {
        query: t.Object({
            w: t.Optional(t.String()),
            h: t.Optional(t.String()),
            q: t.Optional(t.String())
        })
    });
