import { Elysia, t } from 'elysia';
import { authPlugin } from '../lib/auth';
import { join } from 'path';
import sharp from 'sharp';
import { mkdir } from 'fs/promises';

// Magic bytes for common image formats
const IMAGE_SIGNATURES: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF...WEBP
    'image/bmp': [[0x42, 0x4D]],
};

async function validateMagicBytes(buffer: ArrayBuffer): Promise<boolean> {
    const bytes = new Uint8Array(buffer);

    for (const signatures of Object.values(IMAGE_SIGNATURES)) {
        for (const sig of signatures) {
            if (sig.every((byte, i) => bytes[i] === byte)) {
                return true;
            }
        }
    }
    return false;
}

async function ensureDir(path: string) {
    try {
        await mkdir(path, { recursive: true });
    } catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
    }
}

export const uploadRoutes = new Elysia({ prefix: '/uploads' })
    .use(authPlugin)
    .post('/', async ({ body, set, isAuthenticated, user }: any) => {
        if (!isAuthenticated) {
            set.status = 401;
            return { success: false, error: 'Unauthorized' };
        }

        const file = body.file;

        if (!file) {
            set.status = 400;
            return { success: false, error: 'No file uploaded' };
        }

        // Validate file type (MIME check)
        if (!file.type.startsWith('image/')) {
            set.status = 400;
            return { success: false, error: 'Only image files are allowed' };
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            set.status = 400;
            return { success: false, error: 'File size exceeds 5MB limit' };
        }

        // Read file buffer for magic bytes validation
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Validate magic bytes (security)
        const isValidImage = await validateMagicBytes(arrayBuffer);
        if (!isValidImage) {
            set.status = 400;
            return { success: false, error: 'Invalid image file format' };
        }

        // Generate unique filename
        const timestamp = Date.now();
        const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 50);
        const fileName = `${timestamp}-${baseName}`;

        // Tenant isolation: uploads/{tenantId}/{size}/
        const tenantId = user.tenantId || 'global';
        const basePath = join('uploads', tenantId);

        // Create directories for different sizes
        const fullPath = join(basePath, 'full');
        const mediumPath = join(basePath, 'medium');
        const thumbPath = join(basePath, 'thumb');

        await ensureDir(fullPath);
        await ensureDir(mediumPath);
        await ensureDir(thumbPath);

        try {
            // Process with Sharp - convert to WebP
            const sharpInstance = sharp(buffer);
            const metadata = await sharpInstance.metadata();

            // Full size (max 1920px width, maintain aspect ratio)
            const fullFileName = `${fileName}.webp`;
            await sharp(buffer)
                .resize(1920, null, {
                    withoutEnlargement: true,
                    fit: 'inside'
                })
                .webp({ quality: 85 })
                .toFile(join(fullPath, fullFileName));

            // Medium size (400x400 cover)
            const mediumFileName = `${fileName}.webp`;
            await sharp(buffer)
                .resize(400, 400, {
                    fit: 'cover',
                    position: 'center'
                })
                .webp({ quality: 80 })
                .toFile(join(mediumPath, mediumFileName));

            // Thumbnail (100x100 cover)
            const thumbFileName = `${fileName}.webp`;
            await sharp(buffer)
                .resize(100, 100, {
                    fit: 'cover',
                    position: 'center'
                })
                .webp({ quality: 75 })
                .toFile(join(thumbPath, thumbFileName));

            // Build URLs
            const fullUrl = `/uploads/${tenantId}/full/${fullFileName}`;
            const mediumUrl = `/uploads/${tenantId}/medium/${mediumFileName}`;
            const thumbUrl = `/uploads/${tenantId}/thumb/${thumbFileName}`;

            return {
                success: true,
                data: {
                    url: fullUrl,
                    thumbnails: {
                        thumb: thumbUrl,
                        medium: mediumUrl
                    },
                    metadata: {
                        width: metadata.width,
                        height: metadata.height,
                        format: 'webp'
                    }
                }
            };
        } catch (error) {
            console.error('Upload error:', error);
            set.status = 500;
            return { success: false, error: 'Failed to process image' };
        }
    }, {
        body: t.Object({
            file: t.File()
        })
    })

    // Delete an uploaded image
    .delete('/:tenantId/:size/:filename', async ({ params, set, isAuthenticated, user }: any) => {
        if (!isAuthenticated) {
            set.status = 401;
            return { success: false, error: 'Unauthorized' };
        }

        // Only allow users to delete their own tenant's files
        if (user.tenantId !== params.tenantId && user.role !== 'super_admin') {
            set.status = 403;
            return { success: false, error: 'Forbidden' };
        }

        const { unlink } = await import('fs/promises');
        const sizes = ['full', 'medium', 'thumb'];
        const baseName = params.filename;

        try {
            // Delete all size variants
            for (const size of sizes) {
                const filePath = join('uploads', params.tenantId, size, baseName);
                try {
                    await unlink(filePath);
                } catch (err: any) {
                    if (err.code !== 'ENOENT') console.error(`Failed to delete ${filePath}:`, err);
                }
            }

            return { success: true, message: 'Image deleted' };
        } catch (error) {
            console.error('Delete error:', error);
            set.status = 500;
            return { success: false, error: 'Failed to delete image' };
        }
    }, {
        params: t.Object({
            tenantId: t.String(),
            size: t.String(),
            filename: t.String()
        })
    });
