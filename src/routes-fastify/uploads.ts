import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { join } from 'path';
import sharp from 'sharp';
import { mkdir } from 'fs/promises';

// Magic bytes for common image formats
const IMAGE_SIGNATURES: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
    'image/bmp': [[0x42, 0x4D]],
};

async function validateMagicBytes(buffer: ArrayBuffer): Promise<boolean> {
    const bytes = new Uint8Array(buffer);
    for (const signatures of Object.values(IMAGE_SIGNATURES)) {
        for (const sig of signatures) {
            if (sig.every((byte, i) => bytes[i] === byte)) return true;
        }
    }
    return false;
}

async function ensureDir(path: string) {
    try { await mkdir(path, { recursive: true }); } catch (err: any) { if (err.code !== 'EEXIST') throw err; }
}

const DeleteParamsSchema = Type.Object({
    tenantId: Type.String(),
    size: Type.String(),
    filename: Type.String(),
});

type DeleteParams = Static<typeof DeleteParamsSchema>;

export const uploadRoutes: FastifyPluginAsync = async (fastify) => {
    // Upload image
    fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const user = request.user!;

        const data = await request.file();
        if (!data) {
            return reply.code(400).send({ success: false, error: 'No file uploaded' });
        }

        const buffer = await data.toBuffer();
        const mimeType = data.mimetype;

        // Validate file type
        if (!mimeType.startsWith('image/')) {
            return reply.code(400).send({ success: false, error: 'Only image files are allowed' });
        }

        // Validate file size (5MB)
        if (buffer.length > 5 * 1024 * 1024) {
            return reply.code(400).send({ success: false, error: 'File size exceeds 5MB limit' });
        }

        // Validate magic bytes
        const isValidImage = await validateMagicBytes(buffer.buffer as ArrayBuffer);
        if (!isValidImage) {
            return reply.code(400).send({ success: false, error: 'Invalid image file format' });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const baseName = (data.filename || 'image').replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 50);
        const fileName = `${timestamp}-${baseName}`;

        // Tenant isolation
        const tenantId = user.tenantId || 'global';
        const basePath = join('uploads', tenantId);

        const fullPath = join(basePath, 'full');
        const mediumPath = join(basePath, 'medium');
        const thumbPath = join(basePath, 'thumb');

        await ensureDir(fullPath);
        await ensureDir(mediumPath);
        await ensureDir(thumbPath);

        try {
            const metadata = await sharp(buffer).metadata();

            // Full size (max 1920px width)
            const fullFileName = `${fileName}.webp`;
            await sharp(buffer).resize(1920, null, { withoutEnlargement: true, fit: 'inside' })
                .webp({ quality: 85 }).toFile(join(fullPath, fullFileName));

            // Medium (400x400)
            const mediumFileName = `${fileName}.webp`;
            await sharp(buffer).resize(400, 400, { fit: 'cover', position: 'center' })
                .webp({ quality: 80 }).toFile(join(mediumPath, mediumFileName));

            // Thumbnail (100x100)
            const thumbFileName = `${fileName}.webp`;
            await sharp(buffer).resize(100, 100, { fit: 'cover', position: 'center' })
                .webp({ quality: 75 }).toFile(join(thumbPath, thumbFileName));

            const fullUrl = `/uploads/${tenantId}/full/${fullFileName}`;
            const mediumUrl = `/uploads/${tenantId}/medium/${mediumFileName}`;
            const thumbUrl = `/uploads/${tenantId}/thumb/${thumbFileName}`;

            return {
                success: true,
                data: {
                    url: fullUrl,
                    thumbnails: { thumb: thumbUrl, medium: mediumUrl },
                    metadata: { width: metadata.width, height: metadata.height, format: 'webp' }
                }
            };
        } catch (error) {
            console.error('Upload error:', error);
            return reply.code(500).send({ success: false, error: 'Failed to process image' });
        }
    });

    // Delete image
    fastify.delete<{ Params: DeleteParams }>('/:tenantId/:size/:filename', {
        preHandler: [fastify.authenticate],
        schema: { params: DeleteParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { tenantId, filename } = request.params;

        // Only allow users to delete their own tenant's files
        if (user.tenantId !== tenantId && user.role !== 'super_admin') {
            return reply.code(403).send({ success: false, error: 'Forbidden' });
        }

        const { unlink } = await import('fs/promises');
        const sizes = ['full', 'medium', 'thumb'];

        try {
            for (const size of sizes) {
                const filePath = join('uploads', tenantId, size, filename);
                try { await unlink(filePath); } catch (err: any) { if (err.code !== 'ENOENT') console.error(`Failed to delete ${filePath}:`, err); }
            }
            return { success: true, message: 'Image deleted' };
        } catch (error) {
            console.error('Delete error:', error);
            return reply.code(500).send({ success: false, error: 'Failed to delete image' });
        }
    });
};
