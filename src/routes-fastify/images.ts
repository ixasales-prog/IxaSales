import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import sharp from 'sharp';
import path from 'path';
import fs, { createReadStream } from 'fs';
import { Readable } from 'stream';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const CACHE_DIR = path.join(process.cwd(), 'uploads', '.cache');

const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
};

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Schemas
const ImageQuerySchema = Type.Object({
    w: Type.Optional(Type.String()),
    h: Type.Optional(Type.String()),
    q: Type.Optional(Type.String()),
});

type ImageQuery = Static<typeof ImageQuerySchema>;

export const imageRoutes: FastifyPluginAsync = async (fastify) => {
    // GET /images/*
    fastify.get<{ Params: { '*': string }; Querystring: ImageQuery }>('/*', {
        schema: {
            querystring: ImageQuerySchema,
        },
    }, async (request, reply) => {
        const filePathParam = request.params['*'];

        if (!filePathParam) {
            return reply.code(404).send('File not provided');
        }

        // Prevent directory traversal
        const safePath = path.normalize(filePathParam).replace(/^(\.\.[\\/])+/, '');
        const originalFilePath = path.join(UPLOADS_DIR, safePath);

        if (!fs.existsSync(originalFilePath)) {
            return reply.code(404).send('Image not found');
        }

        const width = request.query.w ? parseInt(request.query.w) : null;
        const height = request.query.h ? parseInt(request.query.h) : null;
        const quality = request.query.q ? parseInt(request.query.q) : 80;

        // If no resizing needed, serve original
        if (!width && !height) {
            const ext = path.extname(originalFilePath).toLowerCase();
            const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
            const stream = createReadStream(originalFilePath);

            return reply
                .header('Content-Type', contentType)
                .send(stream);
        }

        // Generate cache key
        const cacheKey = `${safePath.replace(/[\\/]/g, '_')}_w${width || 'auto'}_h${height || 'auto'}_q${quality}`;
        const cacheFilePath = path.join(CACHE_DIR, cacheKey + path.extname(originalFilePath));

        // Check cache
        if (fs.existsSync(cacheFilePath)) {
            const originalStats = fs.statSync(originalFilePath);
            const cacheStats = fs.statSync(cacheFilePath);

            if (cacheStats.mtime >= originalStats.mtime) {
                const ext = path.extname(cacheFilePath).toLowerCase();
                const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
                const stream = createReadStream(cacheFilePath);

                return reply
                    .header('Content-Type', contentType)
                    .send(stream);
            }
        }

        try {
            const transformer = sharp(originalFilePath);

            if (width || height) {
                transformer.resize(width, height, {
                    fit: 'cover',
                    withoutEnlargement: true,
                });
            }

            const ext = path.extname(originalFilePath).toLowerCase();
            if (ext === '.jpg' || ext === '.jpeg') {
                transformer.jpeg({ quality });
            } else if (ext === '.png') {
                transformer.png({ quality });
            } else if (ext === '.webp') {
                transformer.webp({ quality });
            }

            await transformer.toFile(cacheFilePath);

            const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
            const stream = createReadStream(cacheFilePath);

            return reply
                .header('Content-Type', contentType)
                .send(stream);
        } catch (error) {
            console.error('Image optimization error:', error);
            return reply.code(500).send('Error processing image');
        }
    });
};
