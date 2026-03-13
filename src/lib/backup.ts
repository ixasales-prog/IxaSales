/**
 * Database Backup Service
 * 
 * Manages database backups using pg_dump.
 * Requires pg_dump to be available in PATH or specified via PG_DUMP_PATH.
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile, copyFile, rename, chmod } from 'fs/promises';
import { CronJob } from 'cron';
import { createHash, createCipheriv, randomBytes } from 'crypto';
import { pipeline } from 'stream/promises';
import postgres from 'postgres';
import { getBackupSettings, getDefaultTenantSettings, updateBackupSettingsSync } from './systemSettings';
import { buildTenantBackupData, buildTenantBackupDataFromDatabaseUrl, encodeTenantBackupAsSql } from './tenant-export';

// Portable defaults. Override via PG_DUMP_PATH / PSQL_PATH / PG_RESTORE_PATH when needed.
const DEFAULT_PG_DUMP_PATH = 'pg_dump';
const DEFAULT_PSQL_PATH = 'psql';
const DEFAULT_PG_RESTORE_PATH = 'pg_restore';
const BACKUP_DIR = join(process.cwd(), 'backups');
const BACKUP_LOCK_KEY = 95420167;
type BackupFormat = 'sql' | 'custom';
type TenantBackupFormat = 'json' | 'sql';
type OffsiteMode = 'disabled' | 'filesystem' | 's3';
type TenantBackupCreateOptions = {
    includeProducts?: boolean;
    includeCustomers?: boolean;
    includeOrders?: boolean;
    includePayments?: boolean;
    includeInventory?: boolean;
};

export interface BackupFile {
    filename: string;
    size: number;
    createdAt: Date;
    path: string;
    format?: BackupFormat;
    hasManifest?: boolean;
    checksumSha256?: string | null;
}

export interface TenantBackupFile {
    filename: string;
    size: number;
    createdAt: Date;
    path: string;
    tenantId: string;
    format: TenantBackupFormat;
}

export interface BackupVerificationItem {
    filename: string;
    format: BackupFormat;
    sizeBytes: number;
    hasManifest: boolean;
    checksumVerified: boolean;
    offsiteVerified?: boolean;
    restoreDrillAttempted: boolean;
    restoreDrillSucceeded: boolean;
    restoreDrillDurationMs?: number;
    error?: string;
}

export interface BackupVerificationResult {
    success: boolean;
    startedAt: string;
    completedAt: string;
    checked: number;
    passed: number;
    failed: number;
    restoreDrillEnabled: boolean;
    offsiteCheckEnabled: boolean;
    offsiteConfigured: boolean;
    pitrCheckEnabled: boolean;
    pitrConfigured: boolean;
    freshnessChecked: boolean;
    maxAgeHours: number;
    newestBackupAt: string | null;
    freshnessOk: boolean | null;
    items: BackupVerificationItem[];
}

export interface TenantBackupVerificationItem {
    filename: string;
    tenantId: string;
    format: TenantBackupFormat;
    sizeBytes: number;
    hasManifest: boolean;
    checksumVerified: boolean;
    error?: string;
}

export interface TenantBackupVerificationResult {
    success: boolean;
    startedAt: string;
    completedAt: string;
    checked: number;
    passed: number;
    failed: number;
    freshnessChecked: boolean;
    maxAgeHours: number;
    newestBackupAt: string | null;
    freshnessOk: boolean | null;
    items: TenantBackupVerificationItem[];
}

export interface BackupManifestBackfillResult {
    success: boolean;
    scanned: number;
    created: number;
    skipped: number;
    errors: string[];
}

// In-memory reference to running cron job
let backupJob: CronJob | null = null;
let operationInProgress = false;

interface BackupManifest {
    version: 1;
    filename: string;
    format: BackupFormat;
    createdAt: string;
    sizeBytes: number;
    sha256: string;
    pgDumpPath: string;
}

interface TenantBackupManifest {
    version: 1;
    kind: 'tenant';
    filename: string;
    tenantId: string;
    format: TenantBackupFormat;
    createdAt: string;
    sizeBytes: number;
    sha256: string;
}

interface OffsiteReplicaDescriptor {
    version: 1;
    sourceFilename: string;
    sourceSha256: string;
    sourceSizeBytes: number;
    sourceManifestSha256: string;
    replicatedAt: string;
    mode: 'filesystem';
    encrypted: boolean;
    artifactRelativePath: string;
    artifactSha256: string;
    manifestRelativePath: string;
    immutableUntil?: string;
    encryption?: {
        algorithm: 'aes-256-gcm';
        keyId: string;
        iv: string;
        tag: string;
    };
}

function isTenantScopedBackupFilename(filename: string): boolean {
    return filename.startsWith('tenant-');
}

function isFullBackupFilename(filename: string): boolean {
    return filename.endsWith('.sql') || filename.endsWith('.dump') || filename.endsWith('.backup');
}

function getManifestPath(backupPath: string): string {
    return `${backupPath}.meta.json`;
}

function isManifestRequired(): boolean {
    const raw = (process.env.BACKUP_REQUIRE_MANIFEST || 'true').trim().toLowerCase();
    return raw !== 'false';
}

function getOffsiteMode(): OffsiteMode {
    const raw = (process.env.BACKUP_OFFSITE_MODE || 'disabled').trim().toLowerCase();
    if (raw === 'filesystem') return 'filesystem';
    if (raw === 's3') return 's3';
    return 'disabled';
}

function isBuiltInOffsiteEnabled(): boolean {
    return getOffsiteMode() !== 'disabled';
}

function getOffsiteDirectory(): string | null {
    const raw = (process.env.BACKUP_OFFSITE_DIR || '').trim();
    return raw.length > 0 ? raw : null;
}

function getS3Bucket(): string | null {
    const raw = (process.env.BACKUP_OFFSITE_S3_BUCKET || '').trim();
    return raw.length > 0 ? raw : null;
}

function getS3Prefix(): string {
    return (process.env.BACKUP_OFFSITE_S3_PREFIX || '').trim().replace(/^\/+|\/+$/g, '');
}

function getS3ObjectKey(filename: string): string {
    const prefix = getS3Prefix();
    return prefix ? `${prefix}/${filename}` : filename;
}

function getS3ObjectLockMode(): 'COMPLIANCE' | 'GOVERNANCE' {
    const raw = (process.env.BACKUP_OFFSITE_S3_OBJECT_LOCK_MODE || 'COMPLIANCE').trim().toUpperCase();
    return raw === 'GOVERNANCE' ? 'GOVERNANCE' : 'COMPLIANCE';
}

function getS3EncryptionMode(): 'none' | 'AES256' | 'aws:kms' {
    const raw = (process.env.BACKUP_OFFSITE_S3_SSE || '').trim();
    if (!raw) return 'none';
    if (raw.toLowerCase() === 'aes256') return 'AES256';
    if (raw.toLowerCase() === 'aws:kms') return 'aws:kms';
    return 'none';
}

function getS3KmsKeyId(): string | null {
    const raw = (process.env.BACKUP_OFFSITE_S3_KMS_KEY_ID || '').trim();
    return raw.length > 0 ? raw : null;
}

function shouldEncryptOffsiteArtifacts(): boolean {
    const explicit = (process.env.BACKUP_OFFSITE_ENCRYPT || '').trim().toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return isBuiltInOffsiteEnabled();
}

function getOffsiteEncryptionKeyId(): string {
    return (process.env.BACKUP_ENCRYPTION_KEY_ID || 'default').trim() || 'default';
}

function parseOffsiteEncryptionKey(): Buffer {
    const raw = (process.env.BACKUP_ENCRYPTION_KEY || '').trim();
    if (!raw) {
        throw new Error('BACKUP_ENCRYPTION_KEY is not set');
    }

    if (raw.startsWith('hex:')) {
        const value = raw.slice(4);
        const key = Buffer.from(value, 'hex');
        if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY hex value must decode to 32 bytes');
        return key;
    }

    if (raw.startsWith('base64:')) {
        const value = raw.slice(7);
        const key = Buffer.from(value, 'base64');
        if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY base64 value must decode to 32 bytes');
        return key;
    }

    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        return Buffer.from(raw, 'hex');
    }

    if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
        const asBase64 = Buffer.from(raw, 'base64');
        if (asBase64.length === 32) return asBase64;
    }

    const asUtf8 = Buffer.from(raw, 'utf8');
    if (asUtf8.length === 32) return asUtf8;

    throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes (hex/base64/raw)');
}

function getOffsiteHealthFilePath(offsiteDir: string): string {
    return join(offsiteDir, '_offsite_health.json');
}

function getOffsiteDescriptorFilePath(offsiteDir: string, filename: string): string {
    return join(offsiteDir, `${filename}.offsite.json`);
}

function getOffsiteImmutabilityDays(): number {
    const raw = Number(process.env.BACKUP_OFFSITE_IMMUTABILITY_DAYS || 30);
    if (!Number.isFinite(raw)) return 30;
    return Math.max(0, Math.floor(raw));
}

function shouldEnforceOffsiteRetention(): boolean {
    const explicit = (process.env.BACKUP_OFFSITE_RETENTION_ENFORCED || '').trim().toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return process.env.NODE_ENV === 'production';
}

async function setReadOnlyBestEffort(filePath: string): Promise<void> {
    try {
        await chmod(filePath, 0o444);
    } catch {
        // Best effort only. Not all platforms honor mode changes uniformly.
    }
}

function validateBuiltInOffsiteConfig(): { ok: true } | { ok: false; error: string } {
    const mode = getOffsiteMode();
    if (mode === 'disabled') {
        return { ok: false, error: 'Offsite backup policy check failed: BACKUP_OFFSITE_MODE is disabled' };
    }

    if (mode === 'filesystem') {
        if (!getOffsiteDirectory()) {
            return { ok: false, error: 'Offsite backup policy check failed: BACKUP_OFFSITE_DIR is not configured' };
        }
        if (shouldEnforceOffsiteRetention() && getOffsiteImmutabilityDays() <= 0) {
            return { ok: false, error: 'Offsite backup policy check failed: retention enforcement requires BACKUP_OFFSITE_IMMUTABILITY_DAYS > 0' };
        }
        if (shouldEncryptOffsiteArtifacts()) {
            try {
                parseOffsiteEncryptionKey();
            } catch (err: any) {
                return { ok: false, error: `Offsite backup policy check failed: ${err?.message || 'invalid BACKUP_ENCRYPTION_KEY'}` };
            }
        }
        return { ok: true };
    }

    if (mode === 's3') {
        if (!getS3Bucket()) {
            return { ok: false, error: 'Offsite backup policy check failed: BACKUP_OFFSITE_S3_BUCKET is not configured' };
        }
        if (shouldEnforceOffsiteRetention() && getOffsiteImmutabilityDays() <= 0) {
            return { ok: false, error: 'Offsite backup policy check failed: retention enforcement requires BACKUP_OFFSITE_IMMUTABILITY_DAYS > 0' };
        }
        if (shouldEncryptOffsiteArtifacts()) {
            const sse = getS3EncryptionMode();
            if (sse === 'none') {
                return { ok: false, error: 'Offsite backup policy check failed: S3 encryption is required but BACKUP_OFFSITE_S3_SSE is not configured' };
            }
            if (sse === 'aws:kms' && !getS3KmsKeyId()) {
                return { ok: false, error: 'Offsite backup policy check failed: BACKUP_OFFSITE_S3_KMS_KEY_ID is required when BACKUP_OFFSITE_S3_SSE=aws:kms' };
            }
        }
        return { ok: true };
    }

    return { ok: false, error: `Offsite backup policy check failed: unsupported BACKUP_OFFSITE_MODE (${mode})` };
}

function hasConfiguredPostBackupHook(): boolean {
    return !!(process.env.BACKUP_POST_COMMAND_JSON || '').trim() || !!(process.env.BACKUP_POST_COMMAND || '').trim();
}

function shouldRequireOffsiteHook(): boolean {
    const explicit = (process.env.BACKUP_REQUIRE_OFFSITE || '').trim().toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return process.env.NODE_ENV === 'production';
}

function isLocalOnlyBackupsAllowed(): boolean {
    return (process.env.BACKUP_ALLOW_LOCAL_ONLY || 'false').trim().toLowerCase() === 'true';
}

function isPitrRequired(): boolean {
    const explicit = (process.env.BACKUP_REQUIRE_PITR || '').trim().toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return process.env.NODE_ENV === 'production';
}

function isPitrConfigured(): boolean {
    return (process.env.BACKUP_PITR_ENABLED || 'false').trim().toLowerCase() === 'true';
}

function parseCommandArgs(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let escaped = false;

    for (const ch of input) {
        if (escaped) {
            current += ch;
            escaped = false;
            continue;
        }

        if (ch === '\\') {
            escaped = true;
            continue;
        }

        if (quote) {
            if (ch === quote) {
                quote = null;
            } else {
                current += ch;
            }
            continue;
        }

        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }

        if (/\s/.test(ch)) {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            continue;
        }

        current += ch;
    }

    if (quote) {
        throw new Error('Unclosed quote in command string');
    }
    if (escaped) {
        current += '\\';
    }
    if (current.length > 0) {
        tokens.push(current);
    }

    return tokens;
}

async function evaluateOffsitePolicyHealth(): Promise<{ configured: boolean; error?: string }> {
    const offsiteRequired = shouldRequireOffsiteHook() && !isLocalOnlyBackupsAllowed();
    if (!offsiteRequired) return { configured: true };

    if (isBuiltInOffsiteEnabled()) {
        const configValidation = validateBuiltInOffsiteConfig();
        if (!configValidation.ok) {
            return { configured: false, error: configValidation.error };
        }

        const mode = getOffsiteMode();
        if (mode === 'filesystem') {
            const offsiteDir = getOffsiteDirectory() as string;
            try {
                await mkdir(offsiteDir, { recursive: true });
            } catch (err: any) {
                return { configured: false, error: `Offsite backup policy check failed: cannot access BACKUP_OFFSITE_DIR (${err?.message || 'unknown error'})` };
            }

            const healthPath = getOffsiteHealthFilePath(offsiteDir);
            try {
                const healthRaw = await readFile(healthPath, 'utf8');
                const health = JSON.parse(healthRaw);
                const updatedAt = typeof health?.updatedAt === 'string' ? new Date(health.updatedAt) : null;
                if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
                    return { configured: false, error: 'Offsite backup policy check failed: offsite health file is malformed' };
                }

                if (shouldEnforceOffsiteRetention()) {
                    if (health?.retentionEnforced !== true) {
                        return { configured: false, error: 'Offsite backup policy check failed: backend cannot enforce retention policy' };
                    }
                    const immutabilityDays = Number(health?.immutabilityDays || 0);
                    if (!Number.isFinite(immutabilityDays) || immutabilityDays <= 0) {
                        return { configured: false, error: 'Offsite backup policy check failed: immutable retention window is not configured' };
                    }
                }

                const maxAgeHours = Math.max(1, Number(process.env.BACKUP_OFFSITE_MAX_AGE_HOURS || 24));
                const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
                if (updatedAt.getTime() < cutoff) {
                    return { configured: false, error: `Offsite backup policy check failed: no recent offsite replication (last ${updatedAt.toISOString()})` };
                }
                return { configured: true };
            } catch {
                return { configured: false, error: `Offsite backup policy check failed: health file not found (${healthPath})` };
            }
        }

        if (mode === 's3') {
            const bucket = getS3Bucket() as string;
            const prefix = getS3Prefix();
            const listResult = await awsS3ApiJson([
                'list-objects-v2',
                '--bucket', bucket,
                '--prefix', prefix || '',
                '--max-keys', '20',
            ], 120_000);
            if (!listResult.ok) {
                return { configured: false, error: `Offsite backup policy check failed (s3 list): ${listResult.error}` };
            }

            const contents = Array.isArray(listResult.data?.Contents) ? listResult.data.Contents : [];
            if (contents.length === 0) {
                return { configured: false, error: 'Offsite backup policy check failed: no objects found in S3 prefix' };
            }
            const maxAgeHours = Math.max(1, Number(process.env.BACKUP_OFFSITE_MAX_AGE_HOURS || 24));
            const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
            const newestItem = contents
                .map((item: any) => ({
                    key: String(item?.Key || ''),
                    modifiedAt: new Date(item?.LastModified),
                }))
                .filter((item: { key: string; modifiedAt: Date }) => item.key.length > 0 && !Number.isNaN(item.modifiedAt.getTime()))
                .sort((a: { key: string; modifiedAt: Date }, b: { key: string; modifiedAt: Date }) => b.modifiedAt.getTime() - a.modifiedAt.getTime())[0];
            if (!newestItem) {
                return { configured: false, error: 'Offsite backup policy check failed: unable to determine latest S3 object time' };
            }
            if (newestItem.modifiedAt.getTime() < cutoff) {
                return { configured: false, error: `Offsite backup policy check failed: no recent S3 replication (last ${newestItem.modifiedAt.toISOString()})` };
            }

            if (shouldEnforceOffsiteRetention()) {
                const head = await awsS3ApiJson([
                    'head-object',
                    '--bucket', bucket,
                    '--key', newestItem.key,
                ], 120_000);
                if (!head.ok) {
                    return { configured: false, error: `Offsite backup policy check failed (s3 head): ${head.error}` };
                }
                const modeValue = String(head.data?.ObjectLockMode || '').toUpperCase();
                const retainUntilRaw = String(head.data?.ObjectLockRetainUntilDate || '');
                const retainUntil = new Date(retainUntilRaw);
                if (modeValue !== 'COMPLIANCE' && modeValue !== 'GOVERNANCE') {
                    return { configured: false, error: 'Offsite backup policy check failed: S3 Object Lock mode is not set' };
                }
                if (!retainUntilRaw || Number.isNaN(retainUntil.getTime()) || retainUntil.getTime() <= Date.now()) {
                    return { configured: false, error: 'Offsite backup policy check failed: S3 Object Lock retain-until is missing or expired' };
                }
            }
            return { configured: true };
        }

        return { configured: false, error: `Offsite backup policy check failed: unsupported mode ${mode}` };
    }

    if (!hasConfiguredPostBackupHook()) {
        return {
            configured: false,
            error: 'Offsite backup policy check failed: no post-backup hook configured',
        };
    }

    const proofPath = (process.env.BACKUP_OFFSITE_PROOF_PATH || '').trim();
    if (proofPath) {
        try {
            const proofStat = await stat(proofPath);
            const maxAgeHours = Math.max(1, Number(process.env.BACKUP_OFFSITE_MAX_AGE_HOURS || 24));
            const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
            if (proofStat.mtime.getTime() < cutoff) {
                return {
                    configured: false,
                    error: `Offsite backup policy check failed: proof file is stale (${proofPath})`,
                };
            }
            return { configured: true };
        } catch {
            return {
                configured: false,
                error: `Offsite backup policy check failed: proof file not found (${proofPath})`,
            };
        }
    }

    const commandJson = (process.env.BACKUP_OFFSITE_HEALTHCHECK_COMMAND_JSON || '').trim();
    const commandLegacy = (process.env.BACKUP_OFFSITE_HEALTHCHECK_COMMAND || '').trim();
    if (!commandJson && !commandLegacy) {
        return {
            configured: false,
            error: 'Offsite backup policy check failed: configure BACKUP_OFFSITE_PROOF_PATH or BACKUP_OFFSITE_HEALTHCHECK_COMMAND_JSON',
        };
    }

    let command = '';
    let args: string[] = [];
    if (commandJson) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(commandJson);
        } catch (err: any) {
            return { configured: false, error: `Invalid BACKUP_OFFSITE_HEALTHCHECK_COMMAND_JSON: ${err.message}` };
        }
        if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => typeof item !== 'string')) {
            return { configured: false, error: 'BACKUP_OFFSITE_HEALTHCHECK_COMMAND_JSON must be a non-empty JSON string array' };
        }
        const parts = parsed as string[];
        command = parts[0];
        args = parts.slice(1);
    } else {
        try {
            const parts = parseCommandArgs(commandLegacy);
            if (parts.length === 0) {
                return { configured: false, error: 'BACKUP_OFFSITE_HEALTHCHECK_COMMAND cannot be empty' };
            }
            command = parts[0];
            args = parts.slice(1);
        } catch (err: any) {
            return { configured: false, error: `Invalid BACKUP_OFFSITE_HEALTHCHECK_COMMAND: ${err.message}` };
        }
    }

    const timeoutMs = Math.max(5_000, Number(process.env.BACKUP_OFFSITE_HEALTHCHECK_TIMEOUT_MS || 30_000));
    const result = await runCommandWithTimeout(command, args, timeoutMs);
    if (result.spawnError) {
        return { configured: false, error: `Offsite healthcheck command failed to start: ${result.spawnError}` };
    }
    if (result.timedOut) {
        return { configured: false, error: 'Offsite healthcheck command timed out' };
    }
    if (result.code !== 0) {
        return { configured: false, error: result.stderr?.trim() || `Offsite healthcheck command failed with code ${result.code}` };
    }

    return { configured: true };
}

async function evaluatePitrPolicyHealth(dbUrl: string): Promise<{ configured: boolean; error?: string }> {
    if (!isPitrRequired()) return { configured: true };

    // Keep compatibility with existing explicit flag while adding runtime checks.
    if (!isPitrConfigured()) {
        return {
            configured: false,
            error: 'PITR policy check failed: BACKUP_PITR_ENABLED is not true',
        };
    }

    const client = postgres(dbUrl, { max: 1, prepare: false });
    try {
        const modeRows = await client<{ archive_mode: string }[]>`SHOW archive_mode`;
        const commandRows = await client<{ archive_command: string }[]>`SHOW archive_command`;
        const mode = (modeRows?.[0]?.archive_mode || '').toLowerCase();
        const archiveCommand = (commandRows?.[0]?.archive_command || '').trim().toLowerCase();

        if (mode !== 'on' && mode !== 'always') {
            return {
                configured: false,
                error: `PITR policy check failed: archive_mode is "${mode || 'unknown'}"`,
            };
        }
        if (!archiveCommand || archiveCommand === '(disabled)' || archiveCommand === 'false') {
            return {
                configured: false,
                error: 'PITR policy check failed: archive_command is not configured',
            };
        }

        const lagRows = await client<{ lag_minutes: number | null }[]>`
            SELECT
                CASE
                    WHEN last_archived_time IS NULL THEN NULL
                    ELSE EXTRACT(EPOCH FROM (NOW() - last_archived_time)) / 60.0
                END AS lag_minutes
            FROM pg_stat_archiver
            LIMIT 1
        `;
        const maxLagMinutes = Math.max(1, Number(process.env.BACKUP_PITR_MAX_ARCHIVE_LAG_MINUTES || 60));
        const lag = lagRows?.[0]?.lag_minutes;
        if (lag === null || !Number.isFinite(lag)) {
            return {
                configured: false,
                error: 'PITR policy check failed: no archived WAL activity found in pg_stat_archiver',
            };
        }
        if (Number(lag) > maxLagMinutes) {
            return {
                configured: false,
                error: `PITR policy check failed: WAL archive lag is ${Number(lag).toFixed(1)} minutes (limit ${maxLagMinutes})`,
            };
        }

        return { configured: true };
    } catch (err: any) {
        return {
            configured: false,
            error: `PITR policy check failed: ${err?.message || 'unable to query PostgreSQL archiving state'}`,
        };
    } finally {
        try { await client.end(); } catch { /* ignore */ }
    }
}

function getBackupPolicyErrors(): string[] {
    const errors: string[] = [];

    if (shouldRequireOffsiteHook() && !isLocalOnlyBackupsAllowed()) {
        if (isBuiltInOffsiteEnabled()) {
            const validation = validateBuiltInOffsiteConfig();
            if (!validation.ok) {
                errors.push(validation.error);
            }
        } else if (!hasConfiguredPostBackupHook()) {
            errors.push(
                'Offsite backup replication is required but neither first-class offsite mode nor post-backup hook is configured. ' +
                'Set BACKUP_OFFSITE_MODE=filesystem and BACKUP_OFFSITE_DIR, or configure BACKUP_POST_COMMAND_JSON/BACKUP_POST_COMMAND, ' +
                'or explicitly set BACKUP_ALLOW_LOCAL_ONLY=true.'
            );
        }
    }

    if (isPitrRequired() && !isPitrConfigured()) {
        errors.push(
            'PITR policy is required but BACKUP_PITR_ENABLED is not true. ' +
            'Configure WAL archiving and set BACKUP_PITR_ENABLED=true.'
        );
    }

    return errors;
}

function getRestoreDrillSafetyError(primaryDbUrl: string, drillDbUrl: string): string | null {
    const normalizeDbUrl = (value: string): { host: string; port: string; database: string } | null => {
        try {
            const url = new URL(value.trim());
            const database = decodeURIComponent(url.pathname.replace(/^\/+/, '')).toLowerCase();
            return {
                host: (url.hostname || '').toLowerCase(),
                port: url.port || '5432',
                database,
            };
        } catch {
            return null;
        }
    };

    const primary = normalizeDbUrl(primaryDbUrl);
    const drill = normalizeDbUrl(drillDbUrl);

    if (!primary || !drill) {
        if (primaryDbUrl.trim() === drillDbUrl.trim()) {
            return 'Restore drill blocked: BACKUP_VERIFY_DATABASE_URL must not match DATABASE_URL';
        }
        return null;
    }

    if (
        primary.host === drill.host &&
        primary.port === drill.port &&
        primary.database === drill.database
    ) {
        return 'Restore drill blocked: BACKUP_VERIFY_DATABASE_URL points to the same database as DATABASE_URL';
    }

    return null;
}

async function computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);

        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

async function writeBackupManifest(filename: string, backupPath: string, pgDumpPath: string): Promise<void> {
    const fileStats = await stat(backupPath);
    const sha256 = await computeFileSha256(backupPath);

    const manifest: BackupManifest = {
        version: 1,
        filename,
        format: filename.endsWith('.sql') ? 'sql' : 'custom',
        createdAt: new Date().toISOString(),
        sizeBytes: fileStats.size,
        sha256,
        pgDumpPath,
    };

    await writeFile(getManifestPath(backupPath), JSON.stringify(manifest, null, 2), 'utf8');
}

async function readBackupManifest(backupPath: string): Promise<BackupManifest | null> {
    try {
        const raw = await readFile(getManifestPath(backupPath), 'utf8');
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            parsed.version === 1 &&
            typeof parsed.filename === 'string' &&
            typeof parsed.sha256 === 'string' &&
            typeof parsed.sizeBytes === 'number'
        ) {
            return parsed as BackupManifest;
        }
    } catch {
        // Manifest is optional for older backups.
    }
    return null;
}

async function verifyBackupIntegrity(filename: string, backupPath: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const manifest = await readBackupManifest(backupPath);
    if (!manifest) {
        if (isManifestRequired()) {
            return { ok: false, error: 'Backup manifest is required but missing' };
        }
        return { ok: true };
    }

    if (manifest.filename !== filename) {
        return { ok: false, error: 'Backup manifest filename mismatch' };
    }
    if (manifest.format === 'sql' && !filename.endsWith('.sql')) {
        return { ok: false, error: 'Backup manifest format mismatch (expected .sql)' };
    }
    if (manifest.format === 'custom' && !(filename.endsWith('.dump') || filename.endsWith('.backup'))) {
        return { ok: false, error: 'Backup manifest format mismatch (expected .dump/.backup)' };
    }

    const fileStats = await stat(backupPath);
    if (fileStats.size !== manifest.sizeBytes) {
        return { ok: false, error: 'Backup file size does not match manifest' };
    }

    const sha256 = await computeFileSha256(backupPath);
    if (sha256 !== manifest.sha256) {
        return { ok: false, error: 'Backup checksum verification failed' };
    }

    return { ok: true };
}

async function encryptFileAes256Gcm(
    sourcePath: string,
    targetPath: string,
    key: Buffer
): Promise<{ iv: string; tag: string }> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    await pipeline(createReadStream(sourcePath), cipher, createWriteStream(targetPath));
    const tag = cipher.getAuthTag();
    return {
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
    };
}

function buildAwsS3BaseArgs(): string[] {
    const args: string[] = [];
    const region = (process.env.BACKUP_OFFSITE_S3_REGION || '').trim();
    if (region) {
        args.push('--region', region);
    }
    return args;
}

function buildS3MetadataArg(metadata: Record<string, string>): string {
    return Object.entries(metadata)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
}

async function awsS3ApiJson(args: string[], timeoutMs = 120_000): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
    const baseArgs = ['s3api', ...args, ...buildAwsS3BaseArgs(), '--output', 'json'];
    const result = await runCommandWithOutput('aws', baseArgs, timeoutMs);
    if (result.spawnError) {
        return { ok: false, error: `AWS CLI failed to start: ${result.spawnError}` };
    }
    if (result.timedOut) {
        return { ok: false, error: 'AWS CLI command timed out' };
    }
    if (result.code !== 0) {
        const detail = result.stderr.trim();
        return { ok: false, error: detail || `AWS CLI command failed with code ${result.code}` };
    }
    try {
        return { ok: true, data: result.stdout.trim() ? JSON.parse(result.stdout) : {} };
    } catch (err: any) {
        return { ok: false, error: `Failed to parse AWS CLI JSON output: ${err?.message || 'invalid json'}` };
    }
}

async function replicateBackupOffsite(params: {
    filename: string;
    backupPath: string;
    sourceSha256: string;
    sourceSizeBytes: number;
    manifestPath: string;
    manifestSha256: string;
}): Promise<{ ok: true; descriptorPath?: string } | { ok: false; error: string }> {
    const mode = getOffsiteMode();
    if (mode === 'disabled') {
        return { ok: true };
    }

    if (mode === 's3') {
        const bucket = getS3Bucket();
        if (!bucket) {
            return { ok: false, error: 'BACKUP_OFFSITE_S3_BUCKET is not configured for s3 offsite mode' };
        }

        const immutabilityDays = getOffsiteImmutabilityDays();
        const immutableUntil = immutabilityDays > 0
            ? new Date(Date.now() + immutabilityDays * 24 * 60 * 60 * 1000).toISOString()
            : undefined;
        if (shouldEnforceOffsiteRetention() && !immutableUntil) {
            return { ok: false, error: 'S3 retention enforcement requires BACKUP_OFFSITE_IMMUTABILITY_DAYS > 0' };
        }

        const sse = getS3EncryptionMode();
        const s3ArgsCommon: string[] = [];
        if (sse !== 'none') {
            s3ArgsCommon.push('--server-side-encryption', sse);
            if (sse === 'aws:kms') {
                const kmsKeyId = getS3KmsKeyId();
                if (!kmsKeyId) {
                    return { ok: false, error: 'BACKUP_OFFSITE_S3_KMS_KEY_ID is required when BACKUP_OFFSITE_S3_SSE=aws:kms' };
                }
                s3ArgsCommon.push('--ssekms-key-id', kmsKeyId);
            }
        }

        const lockArgs: string[] = [];
        if (immutableUntil) {
            lockArgs.push('--object-lock-mode', getS3ObjectLockMode(), '--object-lock-retain-until-date', immutableUntil);
        }

        const artifactKey = getS3ObjectKey(params.filename);
        const artifactMetadata = buildS3MetadataArg({
            source_filename: params.filename,
            source_sha256: params.sourceSha256,
            source_size_bytes: String(params.sourceSizeBytes),
            source_manifest_sha256: params.manifestSha256,
            retention_enforced: String(shouldEnforceOffsiteRetention()),
        });
        const artifactPut = await awsS3ApiJson([
            'put-object',
            '--bucket', bucket,
            '--key', artifactKey,
            '--body', params.backupPath,
            '--metadata', artifactMetadata,
            ...s3ArgsCommon,
            ...lockArgs,
        ], 180_000);
        if (!artifactPut.ok) {
            return { ok: false, error: `S3 offsite upload failed for backup file: ${artifactPut.error}` };
        }

        const manifestKey = getS3ObjectKey(`${params.filename}.meta.json`);
        const manifestMetadata = buildS3MetadataArg({
            source_filename: params.filename,
            source_manifest_sha256: params.manifestSha256,
        });
        const manifestPut = await awsS3ApiJson([
            'put-object',
            '--bucket', bucket,
            '--key', manifestKey,
            '--body', params.manifestPath,
            '--metadata', manifestMetadata,
            ...s3ArgsCommon,
            ...lockArgs,
        ], 180_000);
        if (!manifestPut.ok) {
            return { ok: false, error: `S3 offsite upload failed for manifest: ${manifestPut.error}` };
        }

        return { ok: true, descriptorPath: `s3://${bucket}/${artifactKey}` };
    }

    if (mode !== 'filesystem') {
        return { ok: false, error: `Unsupported offsite mode: ${mode}` };
    }

    const offsiteDir = getOffsiteDirectory();
    if (!offsiteDir) {
        return { ok: false, error: 'BACKUP_OFFSITE_DIR is not configured for filesystem offsite mode' };
    }

    await mkdir(offsiteDir, { recursive: true });
    const encrypt = shouldEncryptOffsiteArtifacts();
    const artifactRelativePath = `${params.filename}${encrypt ? '.enc' : ''}`;
    const artifactPath = join(offsiteDir, artifactRelativePath);
    const tempArtifactPath = `${artifactPath}.tmp`;
    const manifestRelativePath = `${params.filename}.meta.json`;
    const manifestPath = join(offsiteDir, manifestRelativePath);
    const descriptorPath = getOffsiteDescriptorFilePath(offsiteDir, params.filename);

    let encryptionMeta: OffsiteReplicaDescriptor['encryption'] | undefined;
    if (encrypt) {
        const key = parseOffsiteEncryptionKey();
        const encrypted = await encryptFileAes256Gcm(params.backupPath, tempArtifactPath, key);
        await rename(tempArtifactPath, artifactPath);
        encryptionMeta = {
            algorithm: 'aes-256-gcm',
            keyId: getOffsiteEncryptionKeyId(),
            iv: encrypted.iv,
            tag: encrypted.tag,
        };
    } else {
        await copyFile(params.backupPath, artifactPath);
    }

    await copyFile(params.manifestPath, manifestPath);
    const artifactSha256 = await computeFileSha256(artifactPath);

    const immutabilityDays = getOffsiteImmutabilityDays();
    const immutableUntil = immutabilityDays > 0
        ? new Date(Date.now() + immutabilityDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

    const descriptor: OffsiteReplicaDescriptor = {
        version: 1,
        sourceFilename: params.filename,
        sourceSha256: params.sourceSha256,
        sourceSizeBytes: params.sourceSizeBytes,
        sourceManifestSha256: params.manifestSha256,
        replicatedAt: new Date().toISOString(),
        mode: 'filesystem',
        encrypted: encrypt,
        artifactRelativePath,
        artifactSha256,
        manifestRelativePath,
        immutableUntil,
        encryption: encryptionMeta,
    };

    await writeFile(descriptorPath, JSON.stringify(descriptor, null, 2), 'utf8');

    const healthPath = getOffsiteHealthFilePath(offsiteDir);
    await writeFile(healthPath, JSON.stringify({
        version: 1,
        mode: 'filesystem',
        updatedAt: new Date().toISOString(),
        latestFilename: params.filename,
        latestDescriptor: `${params.filename}.offsite.json`,
        retentionEnforced: shouldEnforceOffsiteRetention(),
        immutabilityDays,
    }, null, 2), 'utf8');

    if (immutableUntil) {
        await setReadOnlyBestEffort(artifactPath);
        await setReadOnlyBestEffort(manifestPath);
        await setReadOnlyBestEffort(descriptorPath);
    }

    return { ok: true, descriptorPath };
}

async function verifyOffsiteReplicaForBackup(backup: BackupFile): Promise<{ ok: true } | { ok: false; error: string }> {
    const mode = getOffsiteMode();
    if (mode === 'disabled') {
        return { ok: true };
    }
    if (mode === 's3') {
        const bucket = getS3Bucket();
        if (!bucket) {
            return { ok: false, error: 'BACKUP_OFFSITE_S3_BUCKET is not configured for s3 offsite mode' };
        }

        const sourceManifest = await readBackupManifest(backup.path);
        if (!sourceManifest) {
            return { ok: false, error: 'Offsite replica verification requires local backup manifest' };
        }

        const artifactHead = await awsS3ApiJson([
            'head-object',
            '--bucket', bucket,
            '--key', getS3ObjectKey(backup.filename),
        ], 120_000);
        if (!artifactHead.ok) {
            return { ok: false, error: `S3 offsite artifact missing or unreadable for ${backup.filename}: ${artifactHead.error}` };
        }

        const manifestHead = await awsS3ApiJson([
            'head-object',
            '--bucket', bucket,
            '--key', getS3ObjectKey(`${backup.filename}.meta.json`),
        ], 120_000);
        if (!manifestHead.ok) {
            return { ok: false, error: `S3 offsite manifest missing or unreadable for ${backup.filename}: ${manifestHead.error}` };
        }

        const meta = artifactHead.data?.Metadata || {};
        if ((meta?.source_sha256 || '').toLowerCase() !== sourceManifest.sha256.toLowerCase()) {
            return { ok: false, error: `S3 offsite source checksum metadata mismatch for ${backup.filename}` };
        }
        if (Number(meta?.source_size_bytes || 0) !== Number(sourceManifest.sizeBytes)) {
            return { ok: false, error: `S3 offsite source size metadata mismatch for ${backup.filename}` };
        }

        if (shouldEnforceOffsiteRetention()) {
            const modeValue = String(artifactHead.data?.ObjectLockMode || '').toUpperCase();
            const retainUntilRaw = String(artifactHead.data?.ObjectLockRetainUntilDate || '');
            const retainUntil = new Date(retainUntilRaw);
            if (modeValue !== 'COMPLIANCE' && modeValue !== 'GOVERNANCE') {
                return { ok: false, error: `S3 Object Lock mode is not set for ${backup.filename}` };
            }
            if (!retainUntilRaw || Number.isNaN(retainUntil.getTime())) {
                return { ok: false, error: `S3 Object Lock retain-until is missing for ${backup.filename}` };
            }
            if (retainUntil.getTime() <= Date.now()) {
                return { ok: false, error: `S3 Object Lock retention expired for ${backup.filename}` };
            }
        }

        return { ok: true };
    }
    if (mode !== 'filesystem') {
        return { ok: false, error: `Unsupported offsite mode: ${mode}` };
    }

    const offsiteDir = getOffsiteDirectory();
    if (!offsiteDir) {
        return { ok: false, error: 'BACKUP_OFFSITE_DIR is not configured for filesystem offsite mode' };
    }

    const sourceManifest = await readBackupManifest(backup.path);
    if (!sourceManifest) {
        return { ok: false, error: 'Offsite replica verification requires local backup manifest' };
    }

    const descriptorPath = getOffsiteDescriptorFilePath(offsiteDir, backup.filename);
    let descriptor: OffsiteReplicaDescriptor;
    try {
        const raw = await readFile(descriptorPath, 'utf8');
        descriptor = JSON.parse(raw) as OffsiteReplicaDescriptor;
    } catch {
        return { ok: false, error: `Offsite replica descriptor not found for ${backup.filename}` };
    }

    if (descriptor.version !== 1 || descriptor.sourceFilename !== backup.filename) {
        return { ok: false, error: `Offsite replica descriptor mismatch for ${backup.filename}` };
    }
    if (descriptor.sourceSha256 !== sourceManifest.sha256) {
        return { ok: false, error: `Offsite replica source checksum mismatch for ${backup.filename}` };
    }

    const artifactPath = join(offsiteDir, descriptor.artifactRelativePath);
    const replicatedManifestPath = join(offsiteDir, descriptor.manifestRelativePath);
    try {
        await stat(artifactPath);
    } catch {
        return { ok: false, error: `Offsite replica artifact missing for ${backup.filename}` };
    }
    try {
        await stat(replicatedManifestPath);
    } catch {
        return { ok: false, error: `Offsite replica manifest missing for ${backup.filename}` };
    }

    const artifactSha256 = await computeFileSha256(artifactPath);
    if (artifactSha256 !== descriptor.artifactSha256) {
        return { ok: false, error: `Offsite replica artifact checksum mismatch for ${backup.filename}` };
    }

    if (shouldEnforceOffsiteRetention()) {
        if (!descriptor.immutableUntil) {
            return { ok: false, error: `Offsite replica retention check failed for ${backup.filename}: immutableUntil is missing` };
        }
        const immutableUntil = new Date(descriptor.immutableUntil);
        if (Number.isNaN(immutableUntil.getTime())) {
            return { ok: false, error: `Offsite replica retention check failed for ${backup.filename}: immutableUntil is invalid` };
        }
        if (immutableUntil.getTime() <= Date.now()) {
            return { ok: false, error: `Offsite replica retention check failed for ${backup.filename}: immutableUntil is not in the future` };
        }
    }

    if (descriptor.immutableUntil && process.platform !== 'win32') {
        const artifactStat = await stat(artifactPath);
        if ((artifactStat.mode & 0o222) !== 0) {
            return { ok: false, error: `Offsite replica immutability permission check failed for ${backup.filename}` };
        }
    }

    return { ok: true };
}

async function cleanupOffsiteReplicaForBackup(filename: string): Promise<{ deleted: boolean; skipped: boolean; reason?: string }> {
    const mode = getOffsiteMode();
    if (mode === 'disabled') return { deleted: false, skipped: true, reason: 'offsite mode disabled' };
    if (mode === 's3') {
        const bucket = getS3Bucket();
        if (!bucket) return { deleted: false, skipped: true, reason: 'BACKUP_OFFSITE_S3_BUCKET not configured' };

        const artifactKey = getS3ObjectKey(filename);
        const head = await awsS3ApiJson([
            'head-object',
            '--bucket', bucket,
            '--key', artifactKey,
        ], 120_000);
        if (!head.ok) {
            return { deleted: false, skipped: true, reason: 's3 artifact not found' };
        }

        const retainUntilRaw = String(head.data?.ObjectLockRetainUntilDate || '');
        const retainUntil = new Date(retainUntilRaw);
        if (retainUntilRaw && !Number.isNaN(retainUntil.getTime()) && retainUntil.getTime() > Date.now()) {
            return { deleted: false, skipped: true, reason: `retention lock active until ${retainUntil.toISOString()}` };
        }
        if (shouldEnforceOffsiteRetention() && (!retainUntilRaw || Number.isNaN(retainUntil.getTime()))) {
            return { deleted: false, skipped: true, reason: 'retention enforcement enabled but object lock retain-until is missing' };
        }

        const targets = [artifactKey, getS3ObjectKey(`${filename}.meta.json`)];
        for (const key of targets) {
            const deleted = await awsS3ApiJson([
                'delete-object',
                '--bucket', bucket,
                '--key', key,
            ], 120_000);
            if (!deleted.ok) {
                return { deleted: false, skipped: true, reason: `failed to delete ${key}: ${deleted.error}` };
            }
        }
        return { deleted: true, skipped: false };
    }
    if (mode !== 'filesystem') return { deleted: false, skipped: true, reason: `unsupported offsite mode (${mode})` };

    const offsiteDir = getOffsiteDirectory();
    if (!offsiteDir) return { deleted: false, skipped: true, reason: 'BACKUP_OFFSITE_DIR not configured' };

    const descriptorPath = getOffsiteDescriptorFilePath(offsiteDir, filename);
    let descriptor: OffsiteReplicaDescriptor | null = null;
    try {
        descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as OffsiteReplicaDescriptor;
    } catch {
        return { deleted: false, skipped: true, reason: 'offsite descriptor not found' };
    }

    if (descriptor.immutableUntil) {
        const immutableUntil = new Date(descriptor.immutableUntil);
        if (!Number.isNaN(immutableUntil.getTime()) && immutableUntil.getTime() > Date.now()) {
            return { deleted: false, skipped: true, reason: `retention lock active until ${immutableUntil.toISOString()}` };
        }
    } else if (shouldEnforceOffsiteRetention()) {
        return { deleted: false, skipped: true, reason: 'retention enforcement enabled but descriptor immutableUntil is missing' };
    }

    const targets = [
        join(offsiteDir, descriptor.artifactRelativePath),
        join(offsiteDir, descriptor.manifestRelativePath),
        descriptorPath,
    ];
    for (const target of targets) {
        try {
            if (process.platform !== 'win32') {
                await chmod(target, 0o644);
            }
        } catch {
            // Best effort before delete.
        }
        try {
            await unlink(target);
        } catch {
            // Ignore missing files.
        }
    }

    return { deleted: true, skipped: false };
}

async function writeTenantBackupManifest(
    filename: string,
    backupPath: string,
    tenantId: string,
    format: TenantBackupFormat
): Promise<void> {
    const fileStats = await stat(backupPath);
    const sha256 = await computeFileSha256(backupPath);

    const manifest: TenantBackupManifest = {
        version: 1,
        kind: 'tenant',
        filename,
        tenantId,
        format,
        createdAt: new Date().toISOString(),
        sizeBytes: fileStats.size,
        sha256,
    };

    await writeFile(getManifestPath(backupPath), JSON.stringify(manifest, null, 2), 'utf8');
}

async function readTenantBackupManifest(backupPath: string): Promise<TenantBackupManifest | null> {
    try {
        const raw = await readFile(getManifestPath(backupPath), 'utf8');
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            parsed.version === 1 &&
            parsed.kind === 'tenant' &&
            typeof parsed.filename === 'string' &&
            typeof parsed.tenantId === 'string' &&
            (parsed.format === 'json' || parsed.format === 'sql') &&
            typeof parsed.sizeBytes === 'number' &&
            typeof parsed.sha256 === 'string'
        ) {
            return parsed as TenantBackupManifest;
        }
    } catch {
        // Manifest is optional for older tenant backups.
    }
    return null;
}

async function verifyTenantBackupIntegrity(
    filename: string,
    backupPath: string,
    expectedTenantId?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const parsedName = parseTenantBackupFilename(filename);
    if (!parsedName) {
        return { ok: false, error: 'Invalid tenant backup filename' };
    }

    if (expectedTenantId && parsedName.tenantId !== expectedTenantId) {
        return { ok: false, error: 'Tenant backup file does not belong to expected tenant' };
    }

    const manifest = await readTenantBackupManifest(backupPath);
    if (!manifest) {
        if (isManifestRequired()) {
            return { ok: false, error: 'Tenant backup manifest is required but missing' };
        }
        return { ok: true };
    }

    if (manifest.filename !== filename) {
        return { ok: false, error: 'Tenant backup manifest filename mismatch' };
    }
    if (manifest.tenantId !== parsedName.tenantId) {
        return { ok: false, error: 'Tenant backup manifest tenant mismatch' };
    }
    if (manifest.format !== parsedName.format) {
        return { ok: false, error: 'Tenant backup manifest format mismatch' };
    }
    if (expectedTenantId && manifest.tenantId !== expectedTenantId) {
        return { ok: false, error: 'Tenant backup manifest does not belong to expected tenant' };
    }

    const fileStats = await stat(backupPath);
    if (fileStats.size !== manifest.sizeBytes) {
        return { ok: false, error: 'Tenant backup file size does not match manifest' };
    }

    const sha256 = await computeFileSha256(backupPath);
    if (sha256 !== manifest.sha256) {
        return { ok: false, error: 'Tenant backup checksum verification failed' };
    }

    return { ok: true };
}

async function runRestoreDrillForFile(
    backupFilename: string,
    backupPath: string,
    targetDbUrl: string
): Promise<{ ok: true; durationMs: number } | { ok: false; error: string; durationMs: number }> {
    const isSqlBackup = backupFilename.endsWith('.sql');
    const isCustomBackup = backupFilename.endsWith('.dump') || backupFilename.endsWith('.backup');
    if (!isSqlBackup && !isCustomBackup) {
        return { ok: false, error: 'Unsupported backup format for restore drill', durationMs: 0 };
    }

    const psqlPath = process.env.PSQL_PATH || DEFAULT_PSQL_PATH;
    const pgRestorePath = process.env.PG_RESTORE_PATH || DEFAULT_PG_RESTORE_PATH;
    const commandPath = isSqlBackup ? psqlPath : pgRestorePath;
    const commandArgs = isSqlBackup
        ? ['--no-password', '--single-transaction', '--set', 'ON_ERROR_STOP=1', '--dbname', targetDbUrl, '--file', backupPath]
        : ['--no-password', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', '--dbname', targetDbUrl, backupPath];

    const parseValidatedTableList = (raw: string): string[] => {
        return raw
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter((v) => /^[a-z_][a-z0-9_]*$/.test(v));
    };

    const requiredTables = parseValidatedTableList(
        (process.env.BACKUP_VERIFY_REQUIRED_TABLES || 'tenants,users,products,customers,orders,payments')
    );
    const nonEmptyTables = parseValidatedTableList(
        (process.env.BACKUP_VERIFY_REQUIRED_NONEMPTY_TABLES || 'tenants,users')
    );

    const validateRestoreDrillDatabase = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
        const client = postgres(targetDbUrl, { max: 1, prepare: false });
        try {
            if (requiredTables.length > 0) {
                const foundRows = await client<{ table_name: string }[]>`
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                `;
                const found = new Set((foundRows || []).map((r) => String(r.table_name).toLowerCase()));
                const missing = requiredTables.filter((table) => !found.has(table));
                if (missing.length > 0) {
                    return { ok: false, error: `Restore drill validation failed: missing required tables: ${missing.join(', ')}` };
                }
            }

            for (const table of nonEmptyTables) {
                const rows = await client.unsafe(`SELECT COUNT(*)::bigint AS c FROM "${table}"`);
                const countValue = Number((rows?.[0] as any)?.c || 0);
                if (!Number.isFinite(countValue) || countValue <= 0) {
                    return { ok: false, error: `Restore drill validation failed: table "${table}" is empty` };
                }
            }

            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: `Restore drill validation query failed: ${err?.message || 'unknown error'}` };
        } finally {
            try { await client.end(); } catch { /* ignore */ }
        }
    };

    return new Promise((resolve) => {
        const started = Date.now();
        const timeoutMs = Math.max(30_000, Number(process.env.BACKUP_VERIFY_TIMEOUT_MS || 30 * 60 * 1000));
        let timedOut = false;
        let stderr = '';

        const proc = spawn(commandPath, commandArgs, {
            env: { ...process.env },
            shell: false,
        });

        const timeoutHandle = setTimeout(() => {
            timedOut = true;
            try { proc.kill(); } catch { /* ignore */ }
        }, timeoutMs);

        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        proc.on('close', (code) => {
            clearTimeout(timeoutHandle);
            const durationMs = Date.now() - started;
            if (timedOut) {
                resolve({ ok: false, error: `Restore drill timed out after ${Math.round(timeoutMs / 1000)}s`, durationMs });
                return;
            }
            if (code === 0) {
                validateRestoreDrillDatabase().then((validation) => {
                    if (validation.ok) {
                        resolve({ ok: true, durationMs });
                        return;
                    }
                    resolve({ ok: false, error: validation.error, durationMs });
                }).catch((err: any) => {
                    resolve({ ok: false, error: `Restore drill validation failed: ${err?.message || 'unknown error'}`, durationMs });
                });
                return;
            }
            resolve({
                ok: false,
                error: stderr.trim() || `Restore drill failed with code ${code}`,
                durationMs,
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timeoutHandle);
            const durationMs = Date.now() - started;
            resolve({ ok: false, error: `Failed to start restore drill: ${err.message}`, durationMs });
        });
    });
}

async function runCommandWithTimeout(
    commandPath: string,
    commandArgs: string[],
    timeoutMs: number
): Promise<{ code: number | null; stderr: string; timedOut: boolean; spawnError?: string }> {
    return new Promise((resolve) => {
        let stderr = '';
        let timedOut = false;

        const proc = spawn(commandPath, commandArgs, {
            env: { ...process.env },
            shell: false,
        });

        const timeoutHandle = setTimeout(() => {
            timedOut = true;
            try { proc.kill(); } catch { /* ignore */ }
        }, timeoutMs);

        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        proc.on('close', (code) => {
            clearTimeout(timeoutHandle);
            resolve({
                code,
                stderr,
                timedOut,
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timeoutHandle);
            resolve({
                code: null,
                stderr,
                timedOut,
                spawnError: err.message,
            });
        });
    });
}

async function runCommandWithOutput(
    commandPath: string,
    commandArgs: string[],
    timeoutMs: number
): Promise<{ code: number | null; stderr: string; stdout: string; timedOut: boolean; spawnError?: string }> {
    return new Promise((resolve) => {
        let stderr = '';
        let stdout = '';
        let timedOut = false;

        const proc = spawn(commandPath, commandArgs, {
            env: { ...process.env },
            shell: false,
        });

        const timeoutHandle = setTimeout(() => {
            timedOut = true;
            try { proc.kill(); } catch { /* ignore */ }
        }, timeoutMs);

        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        proc.on('close', (code) => {
            clearTimeout(timeoutHandle);
            resolve({
                code,
                stderr,
                stdout,
                timedOut,
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timeoutHandle);
            resolve({
                code: null,
                stderr,
                stdout,
                timedOut,
                spawnError: err.message,
            });
        });
    });
}

async function runPostBackupHook(params: {
    filename: string;
    backupPath: string;
    manifestPath: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const replacePlaceholders = (value: string): string => value
        .replaceAll('{filename}', params.filename)
        .replaceAll('{file}', params.backupPath)
        .replaceAll('{manifest}', params.manifestPath);

    let command = '';
    let args: string[] = [];
    const jsonTemplate = (process.env.BACKUP_POST_COMMAND_JSON || '').trim();
    const legacyTemplate = (process.env.BACKUP_POST_COMMAND || '').trim();
    if (jsonTemplate) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonTemplate);
        } catch (err: any) {
            return { ok: false, error: `Invalid BACKUP_POST_COMMAND_JSON: ${err.message}` };
        }
        if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((p) => typeof p !== 'string')) {
            return { ok: false, error: 'BACKUP_POST_COMMAND_JSON must be a non-empty JSON string array' };
        }
        const parts = (parsed as string[]).map((p) => replacePlaceholders(p));
        command = parts[0];
        args = parts.slice(1);
    } else if (legacyTemplate) {
        let parts: string[];
        try {
            parts = parseCommandArgs(legacyTemplate).map((p) => replacePlaceholders(p));
        } catch (err: any) {
            return { ok: false, error: err.message };
        }
        if (parts.length === 0) return { ok: true };
        command = parts[0];
        args = parts.slice(1);
    } else {
        return { ok: true };
    }

    return new Promise((resolve) => {
        let stderr = '';
        const proc = spawn(command, args, {
            env: { ...process.env },
            shell: false,
        });

        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ ok: true });
                return;
            }

            const detail = stderr.trim();
            resolve({
                ok: false,
                error: detail || `Post-backup hook failed with code ${code}`,
            });
        });

        proc.on('error', (err) => {
            resolve({ ok: false, error: `Failed to start post-backup hook: ${err.message}` });
        });
    });
}

async function acquireDistributedLock(dbUrl: string): Promise<{ success: true; client: ReturnType<typeof postgres> } | { success: false; error: string }> {
    const client = postgres(dbUrl, { max: 1, prepare: false });
    try {
        const result = await client<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${BACKUP_LOCK_KEY}) AS locked`;
        const locked = !!result?.[0]?.locked;
        if (!locked) {
            await client.end();
            return { success: false, error: 'Another backup/restore operation is already running' };
        }
        return { success: true, client };
    } catch (err: any) {
        try { await client.end(); } catch { /* ignore */ }
        return { success: false, error: `Failed to acquire distributed backup lock: ${err.message}` };
    }
}

async function releaseDistributedLock(client: ReturnType<typeof postgres> | null): Promise<void> {
    if (!client) return;
    try {
        await client`SELECT pg_advisory_unlock(${BACKUP_LOCK_KEY})`;
    } catch {
        // Best effort unlock
    } finally {
        try { await client.end(); } catch { /* ignore */ }
    }
}

async function cleanupFailedBackupFile(backupPath: string): Promise<void> {
    try {
        await unlink(backupPath);
    } catch {
        // Best effort cleanup.
    }
    try {
        await unlink(getManifestPath(backupPath));
    } catch {
        // Best effort cleanup.
    }
}

function parseScheduleTime(time: string | undefined): { hour: number; minute: number } {
    const fallback = { hour: 0, minute: 0 };
    if (!time) return fallback;

    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    if (!match) return fallback;

    return {
        hour: Number(match[1]),
        minute: Number(match[2]),
    };
}

function isValidTimeZone(timezone: string): boolean {
    try {
        Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
        return true;
    } catch {
        return false;
    }
}

export async function withBackupOperationLock<T>(
    task: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string; code?: 'BACKUP_IN_PROGRESS' }> {
    if (operationInProgress) {
        return { success: false, code: 'BACKUP_IN_PROGRESS', error: 'Backup/restore is already in progress' };
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return { success: false, error: 'DATABASE_URL not set' };
    }

    const lock = await acquireDistributedLock(dbUrl);
    if (lock.success === false) {
        return { success: false, code: 'BACKUP_IN_PROGRESS', error: lock.error };
    }

    operationInProgress = true;
    try {
        const data = await task();
        return { success: true, data };
    } catch (err: any) {
        return { success: false, error: err?.message || 'Backup/restore operation failed' };
    } finally {
        operationInProgress = false;
        await releaseDistributedLock(lock.client);
    }
}

/**
 * Initialize backup system (ensure dir exists, start schedule)
 */
export async function initBackupService() {
    try {
        await mkdir(BACKUP_DIR, { recursive: true });
        runBackupSchedule();
        const policyErrors = getBackupPolicyErrors();
        if (policyErrors.length > 0) {
            console.error(`[Backup] Policy warning:\n- ${policyErrors.join('\n- ')}`);
        }
        console.log('[Backup] Service initialized');
    } catch (err) {
        console.error('[Backup] Failed to init service:', err);
    }
}

/**
 * Create a new database backup
 */
export async function createBackup(options?: {
    format?: BackupFormat;
}): Promise<{ success: boolean; filename?: string; error?: string; code?: 'BACKUP_IN_PROGRESS' }> {
    if (operationInProgress) {
        return { success: false, code: 'BACKUP_IN_PROGRESS', error: 'Backup/restore is already in progress' };
    }

    const formatEnv = (process.env.BACKUP_FORMAT || 'sql').toLowerCase();
    const requestedFormat = options?.format;
    const backupFormat: BackupFormat = requestedFormat
        ? requestedFormat
        : (formatEnv === 'custom' ? 'custom' : 'sql');
    const extension = backupFormat === 'custom' ? 'dump' : 'sql';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.${extension}`;
    const filepath = join(BACKUP_DIR, filename);

    // Get database connection info from ENV
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return { success: false, error: 'DATABASE_URL not set' };
    }

    const policyErrors = getBackupPolicyErrors();
    if (policyErrors.length > 0) {
        return { success: false, error: policyErrors.join(' | ') };
    }

    const lock = await acquireDistributedLock(dbUrl);
    if (lock.success === false) {
        return { success: false, code: 'BACKUP_IN_PROGRESS', error: lock.error };
    }

    // Determine pg_dump executable path
    const pgDumpPath = process.env.PG_DUMP_PATH || DEFAULT_PG_DUMP_PATH;

    console.log(`[Backup] Starting backup to ${filename}...`);
    operationInProgress = true;

    return new Promise((resolve) => {
        let stderr = '';
        let finalized = false;

        const timeoutMs = Math.max(30_000, Number(process.env.BACKUP_PROCESS_TIMEOUT_MS || 10 * 60 * 1000));
        let timedOut = false;

        // Spawn pg_dump process
        // Use explicit flags and avoid shell to prevent URL/query parsing issues.
        const dumpArgs = backupFormat === 'custom'
            ? ['--no-password', '--format=custom', '--compress=6', '--no-owner', '--no-privileges', '--dbname', dbUrl, '--file', filepath]
            : ['--no-password', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', dbUrl, '--file', filepath];

        const proc = spawn(pgDumpPath, dumpArgs, {
            env: { ...process.env },
            shell: false
        });
        const timeoutHandle = setTimeout(() => {
            timedOut = true;
            try { proc.kill(); } catch { /* ignore */ }
        }, timeoutMs);

        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        const finalize = async (result: { success: boolean; filename?: string; error?: string; code?: 'BACKUP_IN_PROGRESS' }) => {
            if (finalized) return;
            finalized = true;
            operationInProgress = false;
            await releaseDistributedLock(lock.client);
            resolve(result);
        };

        proc.on('close', async (code) => {
            clearTimeout(timeoutHandle);
            if (timedOut) {
                await cleanupFailedBackupFile(filepath);
                await finalize({ success: false, error: `Backup timed out after ${Math.round(timeoutMs / 1000)}s` });
                return;
            }
            if (code === 0) {
                console.log('[Backup] Backup completed successfully');

                try {
                    await writeBackupManifest(filename, filepath, pgDumpPath);
                } catch (err: any) {
                    await cleanupFailedBackupFile(filepath);
                    await finalize({ success: false, error: `Backup manifest creation failed: ${err.message}` });
                    return;
                }

                const manifestPath = getManifestPath(filepath);
                const manifest = await readBackupManifest(filepath);
                if (!manifest) {
                    await cleanupFailedBackupFile(filepath);
                    await finalize({ success: false, error: 'Backup manifest could not be read after creation' });
                    return;
                }

                if (isBuiltInOffsiteEnabled()) {
                    const offsiteReplication = await replicateBackupOffsite({
                        filename,
                        backupPath: filepath,
                        sourceSha256: manifest.sha256,
                        sourceSizeBytes: manifest.sizeBytes,
                        manifestPath,
                        manifestSha256: await computeFileSha256(manifestPath),
                    });
                    if (!offsiteReplication.ok) {
                        const offsiteRequired = shouldRequireOffsiteHook() && !isLocalOnlyBackupsAllowed();
                        if (offsiteRequired) {
                            await finalize({ success: false, error: offsiteReplication.error });
                            return;
                        }
                        console.error(`[Backup] Built-in offsite replication warning: ${offsiteReplication.error}`);
                    }
                }

                const hookResult = await runPostBackupHook({
                    filename,
                    backupPath: filepath,
                    manifestPath,
                });
                if (!hookResult.ok) {
                    const strictHook = process.env.BACKUP_POST_COMMAND_REQUIRED === 'true';
                    if (strictHook) {
                        await cleanupFailedBackupFile(filepath);
                        await finalize({ success: false, error: hookResult.error });
                        return;
                    }
                    console.error(`[Backup] Post-backup hook warning: ${hookResult.error}`);
                }

                // Track latest successful backup time for UI/monitoring.
                updateBackupSettingsSync({ lastBackupAt: new Date().toISOString() });

                // Optional daily tenant snapshots for fast tenant-level restore.
                if (shouldAutoCreateTenantSnapshots()) {
                    const snapshotFormat = getTenantSnapshotFormat();
                    const snapshotBatch = await createTenantSnapshotsForAllTenants(lock.client, snapshotFormat);
                    if (snapshotBatch.failed > 0) {
                        const summary = `Tenant snapshots: created ${snapshotBatch.created}, failed ${snapshotBatch.failed}`;
                        const strictTenantSnapshots = (process.env.BACKUP_TENANT_SNAPSHOT_REQUIRED || 'false') === 'true';
                        if (strictTenantSnapshots) {
                            await finalize({ success: false, error: `${summary}. First error: ${snapshotBatch.errors[0]}` });
                            return;
                        }
                        console.error(`[Backup] ${summary}`);
                        for (const err of snapshotBatch.errors.slice(0, 5)) {
                            console.error(`[Backup] Tenant snapshot error: ${err}`);
                        }
                    } else {
                        console.log(`[Backup] Tenant snapshots completed: ${snapshotBatch.created} created`);
                    }
                }

                // Enforce retention policy after successful backup
                await cleanOldBackups();
                await cleanOldTenantScopedBackups();

                await finalize({ success: true, filename });
            } else {
                console.error(`[Backup] pg_dump exited with code ${code}`);
                const detail = stderr.trim();
                await cleanupFailedBackupFile(filepath);
                await finalize({ success: false, error: detail ? `pg_dump failed (code ${code}): ${detail}` : `pg_dump failed with code ${code}` });
            }
        });

        proc.on('error', async (err) => {
            console.error('[Backup] Process error:', err);
            await cleanupFailedBackupFile(filepath);
            await finalize({ success: false, error: `Failed to start pg_dump (${pgDumpPath}): ${err.message}. Set PG_DUMP_PATH to the correct executable.` });
        });
    });
}

/**
 * List available backups
 */
export async function listBackups(): Promise<BackupFile[]> {
    try {
        const files = await readdir(BACKUP_DIR);
        const backups: BackupFile[] = [];

        for (const file of files) {
            if (!file.endsWith('.sql') && !file.endsWith('.dump') && !file.endsWith('.backup')) continue;
            if (isTenantScopedBackupFilename(file)) continue;

            const path = join(BACKUP_DIR, file);
            const stats = await stat(path);
            const manifest = await readBackupManifest(path);
            backups.push({
                filename: file,
                size: stats.size,
                // mtime is more portable than birthtime across filesystems/containers.
                createdAt: stats.mtime,
                path,
                format: file.endsWith('.sql') ? 'sql' : 'custom',
                hasManifest: !!manifest,
                checksumSha256: manifest?.sha256 || null,
            });
        }

        // Sort by newest first
        return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (err) {
        console.error('[Backup] Failed to list backups:', err);
        return [];
    }
}

/**
 * Get full path to a backup file
 */
export function getBackupPath(filename: string): string {
    // Basic security check to prevent directory traversal
    const safeFilename = filename.replace(/[/\\]/g, '');
    return join(BACKUP_DIR, safeFilename);
}

function buildTenantBackupFilename(tenantId: string, format: TenantBackupFormat): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `tenant-${tenantId}-${timestamp}.${format}`;
}

function getTenantSnapshotFormat(): TenantBackupFormat {
    return (process.env.BACKUP_TENANT_SNAPSHOT_FORMAT || 'json').toLowerCase() === 'sql' ? 'sql' : 'json';
}

function shouldAutoCreateTenantSnapshots(): boolean {
    return (process.env.BACKUP_CREATE_TENANT_SNAPSHOTS || 'false') === 'true';
}

async function writeTenantScopedBackupFile(
    tenantId: string,
    format: TenantBackupFormat,
    options: TenantBackupCreateOptions = {}
): Promise<string> {
    await mkdir(BACKUP_DIR, { recursive: true });
    const filename = buildTenantBackupFilename(tenantId, format);
    const filepath = getBackupPath(filename);
    const payload = await buildTenantBackupData(tenantId, {
        includeProducts: options.includeProducts,
        includeCustomers: options.includeCustomers,
        includeOrders: options.includeOrders,
        includePayments: options.includePayments,
        includeInventory: options.includeInventory,
    });
    const content = format === 'sql'
        ? encodeTenantBackupAsSql(payload, tenantId)
        : JSON.stringify(payload, null, 2);

    await writeFile(filepath, content, 'utf8');
    try {
        await writeTenantBackupManifest(filename, filepath, tenantId, format);
    } catch (err) {
        await cleanupFailedBackupFile(filepath);
        throw err;
    }
    return filename;
}

async function createTenantSnapshotsForAllTenants(
    client: ReturnType<typeof postgres>,
    format: TenantBackupFormat
): Promise<{ created: number; failed: number; errors: string[] }> {
    const activeOnly = (process.env.BACKUP_TENANT_SNAPSHOT_ACTIVE_ONLY || 'true') === 'true';
    const tenantRows = activeOnly
        ? await client<{ id: string }[]>`SELECT id::text AS id FROM tenants WHERE is_active = true ORDER BY created_at ASC`
        : await client<{ id: string }[]>`SELECT id::text AS id FROM tenants ORDER BY created_at ASC`;

    let created = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const tenant of tenantRows) {
        try {
            await writeTenantScopedBackupFile(tenant.id, format);
            created++;
        } catch (err: any) {
            failed++;
            errors.push(`${tenant.id}: ${err?.message || 'Failed to create tenant snapshot'}`);
        }
    }

    return { created, failed, errors };
}

function buildTempDatabaseName(): string {
    const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const rand = Math.random().toString(36).slice(2, 8);
    // PostgreSQL identifier limit is 63 chars.
    return `ixa_tenant_extract_${stamp}_${rand}`.slice(0, 63).toLowerCase();
}

function getAdminDatabaseUrl(dbUrl: string): string {
    const url = new URL(dbUrl);
    url.pathname = '/postgres';
    return url.toString();
}

function getDatabaseUrlWithName(dbUrl: string, dbName: string): string {
    const url = new URL(dbUrl);
    url.pathname = `/${dbName}`;
    return url.toString();
}

function parseTenantBackupFilename(filename: string): { tenantId: string; format: TenantBackupFormat } | null {
    // Exclude manifest sidecar files from backup file handling.
    if (filename.endsWith('.meta.json')) return null;
    const match = /^tenant-([0-9a-fA-F-]{36})-(.+)\.(json|sql)$/.exec(filename);
    if (!match) return null;
    return { tenantId: match[1], format: match[3] as TenantBackupFormat };
}

export async function createTenantScopedBackup(
    tenantId: string,
    format: TenantBackupFormat = 'json',
    options: TenantBackupCreateOptions = {}
): Promise<{ success: boolean; filename?: string; error?: string; code?: 'BACKUP_IN_PROGRESS' }> {
    if (operationInProgress) {
        return { success: false, code: 'BACKUP_IN_PROGRESS', error: 'Backup/restore is already in progress' };
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return { success: false, error: 'DATABASE_URL not set' };

    const lock = await acquireDistributedLock(dbUrl);
    if (lock.success === false) {
        return { success: false, code: 'BACKUP_IN_PROGRESS', error: lock.error };
    }

    operationInProgress = true;
    try {
        const filename = await writeTenantScopedBackupFile(tenantId, format, options);
        return { success: true, filename };
    } catch (err: any) {
        return { success: false, error: err.message };
    } finally {
        operationInProgress = false;
        await releaseDistributedLock(lock.client);
    }
}

export async function extractTenantBackupFromFullBackup(
    filename: string,
    tenantId: string,
    format: TenantBackupFormat = 'json'
): Promise<{ success: boolean; filename?: string; error?: string; code?: 'BACKUP_IN_PROGRESS' }> {
    if (operationInProgress) {
        return { success: false, code: 'BACKUP_IN_PROGRESS', error: 'Backup/restore is already in progress' };
    }

    if (filename.startsWith('tenant-')) {
        return { success: false, error: 'Source file must be a full-system backup (.sql/.dump/.backup), not a tenant backup file' };
    }

    const isSqlBackup = filename.endsWith('.sql');
    const isCustomBackup = filename.endsWith('.dump') || filename.endsWith('.backup');
    if (!isSqlBackup && !isCustomBackup) {
        return { success: false, error: 'Only .sql/.dump/.backup full backups are supported' };
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return { success: false, error: 'DATABASE_URL not set' };
    }

    const lock = await acquireDistributedLock(dbUrl);
    if (lock.success === false) {
        return { success: false, code: 'BACKUP_IN_PROGRESS', error: lock.error };
    }

    const sourcePath = getBackupPath(filename);
    try {
        const fileStat = await stat(sourcePath);
        if (fileStat.size === 0) {
            await releaseDistributedLock(lock.client);
            return { success: false, error: 'Backup file is empty' };
        }
    } catch {
        await releaseDistributedLock(lock.client);
        return { success: false, error: 'Backup file not found' };
    }

    const integrity = await verifyBackupIntegrity(filename, sourcePath);
    if (integrity.ok === false) {
        await releaseDistributedLock(lock.client);
        return { success: false, error: integrity.error };
    }

    const psqlPath = process.env.PSQL_PATH || DEFAULT_PSQL_PATH;
    const pgRestorePath = process.env.PG_RESTORE_PATH || DEFAULT_PG_RESTORE_PATH;
    const timeoutMs = Math.max(30_000, Number(process.env.RESTORE_PROCESS_TIMEOUT_MS || 30 * 60 * 1000));
    const tempDbName = buildTempDatabaseName();
    const adminDbUrl = getAdminDatabaseUrl(dbUrl);
    const tempDbUrl = getDatabaseUrlWithName(dbUrl, tempDbName);
    const adminClient = postgres(adminDbUrl, { max: 1, prepare: false });
    operationInProgress = true;

    try {
        await adminClient.unsafe(`CREATE DATABASE "${tempDbName}"`);

        const restorePath = isSqlBackup ? psqlPath : pgRestorePath;
        const restoreArgs = isSqlBackup
            ? ['--no-password', '--single-transaction', '--set', 'ON_ERROR_STOP=1', '--dbname', tempDbUrl, '--file', sourcePath]
            : ['--no-password', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', '--dbname', tempDbUrl, sourcePath];
        const restored = await runCommandWithTimeout(restorePath, restoreArgs, timeoutMs);

        if (restored.spawnError) {
            const envVarName = isSqlBackup ? 'PSQL_PATH' : 'PG_RESTORE_PATH';
            return { success: false, error: `Failed to start temp restore command (${restorePath}): ${restored.spawnError}. Set ${envVarName} to the correct executable.` };
        }
        if (restored.timedOut) {
            return { success: false, error: `Temp restore timed out after ${Math.round(timeoutMs / 1000)}s` };
        }
        if (restored.code !== 0) {
            const detail = restored.stderr.trim();
            return { success: false, error: detail ? `Temp restore failed (code ${restored.code}): ${detail}` : `Temp restore failed with code ${restored.code}` };
        }

        const tenantPayload = await buildTenantBackupDataFromDatabaseUrl(tempDbUrl, tenantId);
        if (tenantPayload?.metadata && typeof tenantPayload.metadata === 'object') {
            tenantPayload.metadata = {
                ...tenantPayload.metadata,
                extractedFromFullBackup: true,
                sourceFullBackupFilename: filename,
                extractedAt: new Date().toISOString(),
            };
        }
        await mkdir(BACKUP_DIR, { recursive: true });
        const outName = buildTenantBackupFilename(tenantId, format);
        const outPath = getBackupPath(outName);
        const content = format === 'sql'
            ? encodeTenantBackupAsSql(tenantPayload, tenantId)
            : JSON.stringify(tenantPayload, null, 2);
        await writeFile(outPath, content, 'utf8');
        try {
            await writeTenantBackupManifest(outName, outPath, tenantId, format);
        } catch (err) {
            await cleanupFailedBackupFile(outPath);
            throw err;
        }
        return { success: true, filename: outName };
    } catch (err: any) {
        return { success: false, error: err.message };
    } finally {
        try {
            await adminClient.unsafe(`
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = '${tempDbName}' AND pid <> pg_backend_pid()
            `);
            await adminClient.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
        } catch (cleanupErr) {
            console.warn('[Backup] Failed to cleanup temporary extraction database:', cleanupErr);
        }
        try { await adminClient.end(); } catch { /* ignore */ }
        operationInProgress = false;
        await releaseDistributedLock(lock.client);
    }
}

export async function listTenantScopedBackups(tenantId?: string): Promise<TenantBackupFile[]> {
    try {
        const files = await readdir(BACKUP_DIR);
        const list: TenantBackupFile[] = [];
        for (const file of files) {
            const parsed = parseTenantBackupFilename(file);
            if (!parsed) continue;
            if (tenantId && parsed.tenantId !== tenantId) continue;

            const path = join(BACKUP_DIR, file);
            const s = await stat(path);
            list.push({
                filename: file,
                size: s.size,
                createdAt: s.mtime,
                path,
                tenantId: parsed.tenantId,
                format: parsed.format,
            });
        }
        return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (err) {
        console.error('[Backup] Failed to list tenant-scoped backups:', err);
        return [];
    }
}

export async function readTenantScopedBackupFile(
    filename: string,
    expectedTenantId?: string
): Promise<{ success: true; content: string } | { success: false; error: string }> {
    const parsed = parseTenantBackupFilename(filename);
    if (!parsed) {
        return { success: false, error: 'Invalid tenant backup filename' };
    }
    if (expectedTenantId && parsed.tenantId !== expectedTenantId) {
        return { success: false, error: 'Backup filename does not belong to expected tenant' };
    }

    const backupPath = getBackupPath(filename);
    let fileStat;
    try {
        fileStat = await stat(backupPath);
    } catch {
        return { success: false, error: 'Backup file not found' };
    }

    if (fileStat.size === 0) {
        return { success: false, error: 'Backup file is empty' };
    }

    const integrity = await verifyTenantBackupIntegrity(filename, backupPath, expectedTenantId);
    if (integrity.ok === false) {
        return { success: false, error: integrity.error };
    }

    try {
        const content = await readFile(backupPath, 'utf8');
        return { success: true, content };
    } catch {
        return { success: false, error: 'Backup file could not be read' };
    }
}

function shouldRequireInPlaceRestoreConfirmation(): boolean {
    const explicit = (process.env.BACKUP_RESTORE_REQUIRE_CONFIRMATION || '').trim().toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return process.env.NODE_ENV === 'production';
}

function shouldCreateSafetySnapshotBeforeRestore(): boolean {
    const explicit = (process.env.BACKUP_RESTORE_AUTO_SAFETY_SNAPSHOT || '').trim().toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return true;
}

function shouldRequireIsolatedRestoreValidation(): boolean {
    const explicit = (process.env.BACKUP_RESTORE_REQUIRE_ISOLATED_VALIDATION || '').trim().toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return process.env.NODE_ENV === 'production';
}

function shouldFailRestoreIfSafetySnapshotFails(): boolean {
    const explicit = (process.env.BACKUP_RESTORE_SAFETY_SNAPSHOT_REQUIRED || '').trim().toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return true;
}

function getSafetySnapshotFormat(): BackupFormat {
    const configured = (process.env.BACKUP_RESTORE_SAFETY_SNAPSHOT_FORMAT || '').trim().toLowerCase();
    if (configured === 'sql') return 'sql';
    if (configured === 'custom') return 'custom';
    return 'custom';
}

async function createPreRestoreSafetySnapshot(dbUrl: string): Promise<{ success: true; filename: string } | { success: false; error: string }> {
    const format = getSafetySnapshotFormat();
    const extension = format === 'custom' ? 'dump' : 'sql';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `pre-restore-${timestamp}.${extension}`;
    const filepath = join(BACKUP_DIR, filename);
    const pgDumpPath = process.env.PG_DUMP_PATH || DEFAULT_PG_DUMP_PATH;
    const timeoutMs = Math.max(30_000, Number(process.env.BACKUP_PROCESS_TIMEOUT_MS || 10 * 60 * 1000));

    const dumpArgs = format === 'custom'
        ? ['--no-password', '--format=custom', '--compress=6', '--no-owner', '--no-privileges', '--dbname', dbUrl, '--file', filepath]
        : ['--no-password', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', dbUrl, '--file', filepath];

    const result = await runCommandWithTimeout(pgDumpPath, dumpArgs, timeoutMs);
    if (result.spawnError) {
        await cleanupFailedBackupFile(filepath);
        return {
            success: false,
            error: `Failed to start pre-restore safety snapshot (${pgDumpPath}): ${result.spawnError}. Set PG_DUMP_PATH to the correct executable.`,
        };
    }
    if (result.timedOut) {
        await cleanupFailedBackupFile(filepath);
        return {
            success: false,
            error: `Pre-restore safety snapshot timed out after ${Math.round(timeoutMs / 1000)}s`,
        };
    }
    if (result.code !== 0) {
        await cleanupFailedBackupFile(filepath);
        const detail = result.stderr.trim();
        return {
            success: false,
            error: detail ? `Pre-restore safety snapshot failed (code ${result.code}): ${detail}` : `Pre-restore safety snapshot failed with code ${result.code}`,
        };
    }

    try {
        await writeBackupManifest(filename, filepath, pgDumpPath);
    } catch (err: any) {
        await cleanupFailedBackupFile(filepath);
        return {
            success: false,
            error: `Pre-restore safety snapshot manifest creation failed: ${err.message}`,
        };
    }

    return { success: true, filename };
}

async function runIsolatedRestoreValidation(
    filename: string,
    filepath: string,
    dbUrl: string
): Promise<{ success: true } | { success: false; error: string }> {
    const isSqlBackup = filename.endsWith('.sql');
    const isCustomBackup = filename.endsWith('.dump') || filename.endsWith('.backup');
    if (!isSqlBackup && !isCustomBackup) {
        return { success: false, error: 'Unsupported backup format for isolated restore validation' };
    }

    const psqlPath = process.env.PSQL_PATH || DEFAULT_PSQL_PATH;
    const pgRestorePath = process.env.PG_RESTORE_PATH || DEFAULT_PG_RESTORE_PATH;
    const timeoutMs = Math.max(30_000, Number(process.env.BACKUP_RESTORE_ISOLATED_TIMEOUT_MS || process.env.RESTORE_PROCESS_TIMEOUT_MS || 30 * 60 * 1000));

    const tempDbName = buildTempDatabaseName().replace('ixa_tenant_extract_', 'ixa_restore_validate_');
    const adminDbUrl = getAdminDatabaseUrl(dbUrl);
    const tempDbUrl = getDatabaseUrlWithName(dbUrl, tempDbName);
    const adminClient = postgres(adminDbUrl, { max: 1, prepare: false });

    try {
        await adminClient.unsafe(`CREATE DATABASE "${tempDbName}"`);
        const commandPath = isSqlBackup ? psqlPath : pgRestorePath;
        const commandArgs = isSqlBackup
            ? ['--no-password', '--single-transaction', '--set', 'ON_ERROR_STOP=1', '--dbname', tempDbUrl, '--file', filepath]
            : ['--no-password', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', '--dbname', tempDbUrl, filepath];

        const result = await runCommandWithTimeout(commandPath, commandArgs, timeoutMs);
        if (result.spawnError) {
            const envVarName = isSqlBackup ? 'PSQL_PATH' : 'PG_RESTORE_PATH';
            return { success: false, error: `Failed to start isolated restore validation (${commandPath}): ${result.spawnError}. Set ${envVarName} to the correct executable.` };
        }
        if (result.timedOut) {
            return { success: false, error: `Isolated restore validation timed out after ${Math.round(timeoutMs / 1000)}s` };
        }
        if (result.code !== 0) {
            const detail = result.stderr.trim();
            return { success: false, error: detail ? `Isolated restore validation failed (code ${result.code}): ${detail}` : `Isolated restore validation failed with code ${result.code}` };
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: `Isolated restore validation failed: ${err?.message || 'unknown error'}` };
    } finally {
        try {
            await adminClient.unsafe(`
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = '${tempDbName}' AND pid <> pg_backend_pid()
            `);
            await adminClient.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
        } catch (cleanupErr) {
            console.warn('[Backup] Failed to cleanup isolated validation database:', cleanupErr);
        }
        try { await adminClient.end(); } catch { /* ignore */ }
    }
}

export async function restoreBackup(
    filename: string,
    options?: { confirmInPlaceRestore?: boolean }
): Promise<{ success: boolean; message?: string; error?: string; safetySnapshotFilename?: string }> {
    if (operationInProgress) {
        return { success: false, error: 'Backup/restore is already in progress' };
    }

    if (isTenantScopedBackupFilename(filename)) {
        return { success: false, error: 'Tenant backup files are not supported in full-system restore' };
    }

    const isSqlBackup = filename.endsWith('.sql');
    const isCustomBackup = filename.endsWith('.dump') || filename.endsWith('.backup');
    if (!isSqlBackup && !isCustomBackup) {
        return { success: false, error: 'Only .sql/.dump/.backup files can be restored' };
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return { success: false, error: 'DATABASE_URL not set' };
    }

    const lock = await acquireDistributedLock(dbUrl);
    if (lock.success === false) {
        return { success: false, error: lock.error };
    }

    const filepath = getBackupPath(filename);
    let fileStat;
    try {
        fileStat = await stat(filepath);
    } catch {
        await releaseDistributedLock(lock.client);
        return { success: false, error: 'Backup file not found' };
    }

    if (fileStat.size === 0) {
        await releaseDistributedLock(lock.client);
        return { success: false, error: 'Backup file is empty' };
    }

    const integrity = await verifyBackupIntegrity(filename, filepath);
    if (integrity.ok === false) {
        await releaseDistributedLock(lock.client);
        return { success: false, error: integrity.error };
    }

    const psqlPath = process.env.PSQL_PATH || DEFAULT_PSQL_PATH;
    const pgRestorePath = process.env.PG_RESTORE_PATH || DEFAULT_PG_RESTORE_PATH;
    const timeoutMs = Math.max(30_000, Number(process.env.RESTORE_PROCESS_TIMEOUT_MS || 30 * 60 * 1000));
    operationInProgress = true;

    try {
        if (shouldRequireInPlaceRestoreConfirmation() && !options?.confirmInPlaceRestore) {
            return {
                success: false,
                error: 'In-place restore requires explicit confirmation. Re-run with confirmInPlaceRestore=true.',
            };
        }

        if (shouldRequireIsolatedRestoreValidation()) {
            const isolatedValidation = await runIsolatedRestoreValidation(filename, filepath, dbUrl);
            if (!isolatedValidation.success) {
                return {
                    success: false,
                    error: `${isolatedValidation.error} (in-place restore blocked by isolated validation policy)`,
                };
            }
        }

        let safetySnapshotFilename: string | undefined;
        if (shouldCreateSafetySnapshotBeforeRestore()) {
            const safetySnapshot = await createPreRestoreSafetySnapshot(dbUrl);
            if (!safetySnapshot.success) {
                if (shouldFailRestoreIfSafetySnapshotFails()) {
                    return {
                        success: false,
                        error: `${safetySnapshot.error} (restore blocked by safety snapshot policy)`,
                    };
                }
                console.warn(`[Backup] Proceeding without safety snapshot: ${safetySnapshot.error}`);
            } else {
                safetySnapshotFilename = safetySnapshot.filename;
                console.log(`[Backup] Pre-restore safety snapshot created: ${safetySnapshotFilename}`);
            }
        }

        const preDropDrizzle = (process.env.BACKUP_RESTORE_PRE_DROP_DRIZZLE ?? 'true') === 'true';
        if (isSqlBackup && preDropDrizzle) {
            const preDrop = await runCommandWithTimeout(
                psqlPath,
                ['--no-password', '--set', 'ON_ERROR_STOP=1', '--dbname', dbUrl, '--command', 'DROP SCHEMA IF EXISTS drizzle CASCADE;'],
                Math.min(timeoutMs, 120_000)
            );

            if (preDrop.spawnError) {
                return { success: false, error: `Failed to start restore pre-clean (${psqlPath}): ${preDrop.spawnError}. Set PSQL_PATH to the correct executable.` };
            }
            if (preDrop.timedOut) {
                return { success: false, error: 'Restore pre-clean timed out' };
            }
            if (preDrop.code !== 0) {
                const detail = preDrop.stderr.trim();
                console.warn(`[Backup] Restore pre-clean warning (continuing): ${detail || `code ${preDrop.code}`}`);
            }
        }

        const commandPath = isSqlBackup ? psqlPath : pgRestorePath;
        const commandArgs = isSqlBackup
            ? ['--no-password', '--single-transaction', '--set', 'ON_ERROR_STOP=1', '--dbname', dbUrl, '--file', filepath]
            : ['--no-password', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', '--dbname', dbUrl, filepath];

        const restoreResult = await runCommandWithTimeout(commandPath, commandArgs, timeoutMs);
        if (restoreResult.spawnError) {
            const envVarName = isSqlBackup ? 'PSQL_PATH' : 'PG_RESTORE_PATH';
            return { success: false, error: `Failed to start restore command (${commandPath}): ${restoreResult.spawnError}. Set ${envVarName} to the correct executable.` };
        }
        if (restoreResult.timedOut) {
            return { success: false, error: `Restore timed out after ${Math.round(timeoutMs / 1000)}s` };
        }
        if (restoreResult.code === 0) {
            const message = safetySnapshotFilename
                ? `Restore completed successfully. Safety snapshot: ${safetySnapshotFilename}`
                : 'Restore completed successfully';
            return { success: true, message, safetySnapshotFilename };
        }

        const detail = restoreResult.stderr.trim();
        return { success: false, error: detail ? `Restore failed (code ${restoreResult.code}): ${detail}` : `Restore failed with code ${restoreResult.code}` };
    } finally {
        operationInProgress = false;
        await releaseDistributedLock(lock.client);
    }
}

export async function verifyBackups(options?: {
    filename?: string;
    maxFiles?: number;
    runRestoreDrill?: boolean;
    maxAgeHours?: number;
}): Promise<BackupVerificationResult> {
    const startedAt = new Date().toISOString();
    const offsiteCheckEnabled = shouldRequireOffsiteHook() && !isLocalOnlyBackupsAllowed();
    const pitrCheckEnabled = isPitrRequired();
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return {
            success: false,
            startedAt,
            completedAt: new Date().toISOString(),
            checked: 0,
            passed: 0,
            failed: 1,
            restoreDrillEnabled: false,
            offsiteCheckEnabled,
            offsiteConfigured: !offsiteCheckEnabled,
            pitrCheckEnabled,
            pitrConfigured: !pitrCheckEnabled,
            freshnessChecked: false,
            maxAgeHours: 0,
            newestBackupAt: null,
            freshnessOk: null,
            items: [{
                filename: options?.filename || 'n/a',
                format: 'sql',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                restoreDrillAttempted: false,
                restoreDrillSucceeded: false,
                error: 'DATABASE_URL not set',
            }],
        };
    }

    if (operationInProgress) {
        return {
            success: false,
            startedAt,
            completedAt: new Date().toISOString(),
            checked: 0,
            passed: 0,
            failed: 1,
            restoreDrillEnabled: false,
            offsiteCheckEnabled,
            offsiteConfigured: !offsiteCheckEnabled,
            pitrCheckEnabled,
            pitrConfigured: !pitrCheckEnabled,
            freshnessChecked: false,
            maxAgeHours: 0,
            newestBackupAt: null,
            freshnessOk: null,
            items: [{
                filename: options?.filename || 'n/a',
                format: 'sql',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                restoreDrillAttempted: false,
                restoreDrillSucceeded: false,
                error: 'Backup/restore is already in progress',
            }],
        };
    }

    const lock = await acquireDistributedLock(dbUrl);
    if (lock.success === false) {
        return {
            success: false,
            startedAt,
            completedAt: new Date().toISOString(),
            checked: 0,
            passed: 0,
            failed: 1,
            restoreDrillEnabled: false,
            offsiteCheckEnabled,
            offsiteConfigured: !offsiteCheckEnabled,
            pitrCheckEnabled,
            pitrConfigured: !pitrCheckEnabled,
            freshnessChecked: false,
            maxAgeHours: 0,
            newestBackupAt: null,
            freshnessOk: null,
            items: [{
                filename: options?.filename || 'n/a',
                format: 'sql',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                restoreDrillAttempted: false,
                restoreDrillSucceeded: false,
                error: lock.error,
            }],
        };
    }

    operationInProgress = true;
    const items: BackupVerificationItem[] = [];
    let targetBackups: BackupFile[] = [];
    let offsiteConfigured = !offsiteCheckEnabled;
    let pitrConfigured = !pitrCheckEnabled;
    const maxFiles = Math.max(1, Math.min(50, Number(options?.maxFiles || process.env.BACKUP_VERIFY_MAX_FILES || 5)));
    const maxAgeHours = Math.max(0, Number(options?.maxAgeHours ?? process.env.BACKUP_VERIFY_MAX_AGE_HOURS ?? 0));
    const restoreDrillRequested = options?.runRestoreDrill ?? (process.env.BACKUP_VERIFY_RESTORE_DRILL === 'true');
    const restoreDrillDbUrl = (process.env.BACKUP_VERIFY_DATABASE_URL || '').trim();
    const restoreDrillSafetyError = restoreDrillRequested && restoreDrillDbUrl
        ? getRestoreDrillSafetyError(dbUrl, restoreDrillDbUrl)
        : null;
    const restoreDrillEnabled = restoreDrillRequested && !!restoreDrillDbUrl && !restoreDrillSafetyError;

    try {
        const offsiteHealth = await evaluateOffsitePolicyHealth();
        offsiteConfigured = offsiteHealth.configured;
        const pitrHealth = await evaluatePitrPolicyHealth(dbUrl);
        pitrConfigured = pitrHealth.configured;

        if (!offsiteConfigured) {
            items.push({
                filename: '__policy_offsite__',
                format: 'sql',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                restoreDrillAttempted: false,
                restoreDrillSucceeded: false,
                error: offsiteHealth.error || 'Offsite backup policy check failed',
            });
        }
        if (!pitrConfigured) {
            items.push({
                filename: '__policy_pitr__',
                format: 'sql',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                restoreDrillAttempted: false,
                restoreDrillSucceeded: false,
                error: pitrHealth.error || 'PITR policy check failed',
            });
        }

        if (restoreDrillRequested && !restoreDrillDbUrl) {
            items.push({
                filename: options?.filename || 'n/a',
                format: 'sql',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                restoreDrillAttempted: false,
                restoreDrillSucceeded: false,
                error: 'Restore drill requested but BACKUP_VERIFY_DATABASE_URL is not configured',
            });
        }
        if (restoreDrillRequested && restoreDrillSafetyError) {
            items.push({
                filename: options?.filename || 'n/a',
                format: 'sql',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                restoreDrillAttempted: false,
                restoreDrillSucceeded: false,
                error: restoreDrillSafetyError,
            });
        }

        if (options?.filename) {
            if (isTenantScopedBackupFilename(options.filename)) {
                items.push({
                    filename: options.filename,
                    format: options.filename.endsWith('.sql') ? 'sql' : 'custom',
                    sizeBytes: 0,
                    hasManifest: false,
                    checksumVerified: false,
                    restoreDrillAttempted: false,
                    restoreDrillSucceeded: false,
                    error: 'Tenant backup files are not part of full-system backup verification',
                });
            } else if (!isFullBackupFilename(options.filename)) {
                items.push({
                    filename: options.filename,
                    format: options.filename.endsWith('.sql') ? 'sql' : 'custom',
                    sizeBytes: 0,
                    hasManifest: false,
                    checksumVerified: false,
                    restoreDrillAttempted: false,
                    restoreDrillSucceeded: false,
                    error: 'Only .sql/.dump/.backup files are supported for full-system backup verification',
                });
            } else {
                const backupPath = getBackupPath(options.filename);
                try {
                    const s = await stat(backupPath);
                    targetBackups = [{
                        filename: options.filename,
                        size: s.size,
                        createdAt: s.mtime,
                        path: backupPath,
                        format: options.filename.endsWith('.sql') ? 'sql' : 'custom',
                    }];
                } catch {
                    items.push({
                        filename: options.filename,
                        format: options.filename.endsWith('.sql') ? 'sql' : 'custom',
                        sizeBytes: 0,
                        hasManifest: false,
                        checksumVerified: false,
                        restoreDrillAttempted: false,
                        restoreDrillSucceeded: false,
                        error: 'Backup file not found',
                    });
                }
            }
        } else {
            const backups = await listBackups();
            targetBackups = backups.slice(0, maxFiles);
            if (targetBackups.length === 0) {
                items.push({
                    filename: 'n/a',
                    format: 'sql',
                    sizeBytes: 0,
                    hasManifest: false,
                    checksumVerified: false,
                    restoreDrillAttempted: false,
                    restoreDrillSucceeded: false,
                    error: 'No backups found to verify',
                });
            }
        }

        for (const backup of targetBackups) {
            const format: BackupFormat = backup.filename.endsWith('.sql') ? 'sql' : 'custom';
            const manifest = await readBackupManifest(backup.path);
            const integrity = await verifyBackupIntegrity(backup.filename, backup.path);
            const offsiteModeEnabled = isBuiltInOffsiteEnabled();
            const baseItem: BackupVerificationItem = {
                filename: backup.filename,
                format,
                sizeBytes: backup.size,
                hasManifest: !!manifest,
                checksumVerified: integrity.ok,
                offsiteVerified: offsiteModeEnabled ? false : undefined,
                restoreDrillAttempted: false,
                restoreDrillSucceeded: false,
            };

            if (integrity.ok === false) {
                items.push({ ...baseItem, error: integrity.error });
                continue;
            }

            if (offsiteModeEnabled) {
                const offsite = await verifyOffsiteReplicaForBackup(backup);
                if (!offsite.ok) {
                    items.push({ ...baseItem, offsiteVerified: false, error: offsite.error });
                    continue;
                }
                baseItem.offsiteVerified = true;
            }

            if (restoreDrillEnabled) {
                const drill = await runRestoreDrillForFile(backup.filename, backup.path, restoreDrillDbUrl);
                if (drill.ok) {
                    items.push({
                        ...baseItem,
                        restoreDrillAttempted: true,
                        restoreDrillSucceeded: true,
                        restoreDrillDurationMs: drill.durationMs,
                    });
                } else {
                    items.push({
                        ...baseItem,
                        restoreDrillAttempted: true,
                        restoreDrillSucceeded: false,
                        restoreDrillDurationMs: drill.durationMs,
                        error: drill.error,
                    });
                }
                continue;
            }

            items.push(baseItem);
        }
    } finally {
        operationInProgress = false;
        await releaseDistributedLock(lock.client);
    }

    const lookupBackup = targetBackupsLookupFactory(targetBackups);
    let newestBackupAt: Date | null = null;
    for (const item of items) {
        const backup = item.filename && item.filename !== 'n/a' && item.filename !== '__freshness__'
            ? lookupBackup(item.filename)
            : null;
        if (backup && (!newestBackupAt || backup.createdAt > newestBackupAt)) {
            newestBackupAt = backup.createdAt;
        }
    }

    const freshnessChecked = maxAgeHours > 0;
    let freshnessOk: boolean | null = null;
    if (freshnessChecked) {
        if (!newestBackupAt) {
            freshnessOk = false;
            items.push({
                filename: '__freshness__',
                format: 'sql',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                restoreDrillAttempted: false,
                restoreDrillSucceeded: false,
                error: 'No backup available for freshness check',
            });
        } else {
            const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
            freshnessOk = newestBackupAt.getTime() >= cutoff;
            if (!freshnessOk) {
                items.push({
                    filename: '__freshness__',
                    format: 'sql',
                    sizeBytes: 0,
                    hasManifest: false,
                    checksumVerified: false,
                    restoreDrillAttempted: false,
                    restoreDrillSucceeded: false,
                    error: `Newest backup is older than ${maxAgeHours} hour(s): ${newestBackupAt.toISOString()}`,
                });
            }
        }
    }

    const finalFailed = items.filter((i) => i.error).length;
    const finalPassed = items.length - finalFailed;

    return {
        success: finalFailed === 0 && items.length > 0,
        startedAt,
        completedAt: new Date().toISOString(),
        checked: items.length,
        passed: finalPassed,
        failed: finalFailed,
        restoreDrillEnabled,
        offsiteCheckEnabled,
        offsiteConfigured,
        pitrCheckEnabled,
        pitrConfigured,
        freshnessChecked,
        maxAgeHours,
        newestBackupAt: newestBackupAt ? newestBackupAt.toISOString() : null,
        freshnessOk,
        items,
    };
}

export async function verifyTenantBackups(options?: {
    tenantId?: string;
    maxFiles?: number;
    maxAgeHours?: number;
}): Promise<TenantBackupVerificationResult> {
    const startedAt = new Date().toISOString();
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return {
            success: false,
            startedAt,
            completedAt: new Date().toISOString(),
            checked: 0,
            passed: 0,
            failed: 1,
            freshnessChecked: false,
            maxAgeHours: 0,
            newestBackupAt: null,
            freshnessOk: null,
            items: [{
                filename: options?.tenantId ? `tenant-${options.tenantId}` : 'n/a',
                tenantId: options?.tenantId || 'n/a',
                format: 'json',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                error: 'DATABASE_URL not set',
            }],
        };
    }

    if (operationInProgress) {
        return {
            success: false,
            startedAt,
            completedAt: new Date().toISOString(),
            checked: 0,
            passed: 0,
            failed: 1,
            freshnessChecked: false,
            maxAgeHours: 0,
            newestBackupAt: null,
            freshnessOk: null,
            items: [{
                filename: options?.tenantId ? `tenant-${options.tenantId}` : 'n/a',
                tenantId: options?.tenantId || 'n/a',
                format: 'json',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                error: 'Backup/restore is already in progress',
            }],
        };
    }

    const lock = await acquireDistributedLock(dbUrl);
    if (lock.success === false) {
        return {
            success: false,
            startedAt,
            completedAt: new Date().toISOString(),
            checked: 0,
            passed: 0,
            failed: 1,
            freshnessChecked: false,
            maxAgeHours: 0,
            newestBackupAt: null,
            freshnessOk: null,
            items: [{
                filename: options?.tenantId ? `tenant-${options.tenantId}` : 'n/a',
                tenantId: options?.tenantId || 'n/a',
                format: 'json',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                error: lock.error,
            }],
        };
    }

    operationInProgress = true;
    const items: TenantBackupVerificationItem[] = [];
    const maxFiles = Math.max(1, Math.min(200, Number(options?.maxFiles || 20)));
    const maxAgeHours = Math.max(0, Number(options?.maxAgeHours ?? process.env.BACKUP_VERIFY_MAX_AGE_HOURS ?? 0));
    let newestBackupAt: Date | null = null;

    try {
        const snapshots = (await listTenantScopedBackups(options?.tenantId)).slice(0, maxFiles);
        if (snapshots.length === 0) {
            items.push({
                filename: options?.tenantId ? `tenant-${options.tenantId}` : 'n/a',
                tenantId: options?.tenantId || 'n/a',
                format: 'json',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                error: 'No tenant backups found to verify',
            });
        }

        for (const snapshot of snapshots) {
            const manifest = await readTenantBackupManifest(snapshot.path);
            const integrity = await verifyTenantBackupIntegrity(snapshot.filename, snapshot.path, options?.tenantId);
            if (!newestBackupAt || snapshot.createdAt > newestBackupAt) {
                newestBackupAt = snapshot.createdAt;
            }

            items.push({
                filename: snapshot.filename,
                tenantId: snapshot.tenantId,
                format: snapshot.format,
                sizeBytes: snapshot.size,
                hasManifest: !!manifest,
                checksumVerified: integrity.ok,
                error: integrity.ok ? undefined : integrity.error,
            });
        }
    } finally {
        operationInProgress = false;
        await releaseDistributedLock(lock.client);
    }

    const freshnessChecked = maxAgeHours > 0;
    let freshnessOk: boolean | null = null;
    if (freshnessChecked) {
        if (!newestBackupAt) {
            freshnessOk = false;
            items.push({
                filename: '__freshness__',
                tenantId: options?.tenantId || 'all',
                format: 'json',
                sizeBytes: 0,
                hasManifest: false,
                checksumVerified: false,
                error: 'No tenant backup available for freshness check',
            });
        } else {
            const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
            freshnessOk = newestBackupAt.getTime() >= cutoff;
            if (!freshnessOk) {
                items.push({
                    filename: '__freshness__',
                    tenantId: options?.tenantId || 'all',
                    format: 'json',
                    sizeBytes: 0,
                    hasManifest: false,
                    checksumVerified: false,
                    error: `Newest tenant backup is older than ${maxAgeHours} hour(s): ${newestBackupAt.toISOString()}`,
                });
            }
        }
    }

    const failed = items.filter((item) => item.error).length;
    const passed = items.length - failed;

    return {
        success: failed === 0 && items.length > 0,
        startedAt,
        completedAt: new Date().toISOString(),
        checked: items.length,
        passed,
        failed,
        freshnessChecked,
        maxAgeHours,
        newestBackupAt: newestBackupAt ? newestBackupAt.toISOString() : null,
        freshnessOk,
        items,
    };
}

function targetBackupsLookupFactory(backups: BackupFile[]) {
    const map = new Map<string, BackupFile>();
    for (const b of backups) {
        map.set(b.filename, b);
    }
    return (filename: string) => map.get(filename) || null;
}

export async function backfillBackupManifests(options?: { maxFiles?: number }): Promise<BackupManifestBackfillResult> {
    if (operationInProgress) {
        return {
            success: false,
            scanned: 0,
            created: 0,
            skipped: 0,
            errors: ['Backup/restore is already in progress'],
        };
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return {
            success: false,
            scanned: 0,
            created: 0,
            skipped: 0,
            errors: ['DATABASE_URL not set'],
        };
    }

    const lock = await acquireDistributedLock(dbUrl);
    if (lock.success === false) {
        return {
            success: false,
            scanned: 0,
            created: 0,
            skipped: 0,
            errors: [lock.error],
        };
    }

    operationInProgress = true;
    const errors: string[] = [];
    let created = 0;
    let skipped = 0;

    try {
        const maxFiles = Math.max(1, Math.min(500, Number(options?.maxFiles || 500)));
        const backups = (await listBackups()).slice(0, maxFiles);
        const pgDumpPath = process.env.PG_DUMP_PATH || DEFAULT_PG_DUMP_PATH;

        for (const backup of backups) {
            if (backup.hasManifest) {
                skipped++;
                continue;
            }

            try {
                await writeBackupManifest(backup.filename, backup.path, pgDumpPath);
                created++;
            } catch (err: any) {
                errors.push(`${backup.filename}: ${err.message}`);
            }
        }

        return {
            success: errors.length === 0,
            scanned: backups.length,
            created,
            skipped,
            errors,
        };
    } finally {
        operationInProgress = false;
        await releaseDistributedLock(lock.client);
    }
}

/**
 * Clean up old backups based on retention settings
 */
export async function cleanOldBackups() {
    const backupSettings = getBackupSettings();
    const retentionDays = backupSettings.retentionDays ?? 30; // Default 30 days
    if (retentionDays <= 0) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const backups = await listBackups();
    let deletedCount = 0;

    for (const backup of backups) {
        if (backup.createdAt < cutoffDate) {
            try {
                await unlink(backup.path);
                try {
                    await unlink(getManifestPath(backup.path));
                } catch {
                    // Ignore missing manifest files from older backups.
                }
                try {
                    const offsiteCleanup = await cleanupOffsiteReplicaForBackup(backup.filename);
                    if (offsiteCleanup.skipped && offsiteCleanup.reason && !offsiteCleanup.reason.includes('disabled')) {
                        console.log(`[Backup] Offsite cleanup skipped for ${backup.filename}: ${offsiteCleanup.reason}`);
                    }
                } catch (offsiteErr) {
                    console.error(`[Backup] Offsite cleanup failed for ${backup.filename}:`, offsiteErr);
                }
                deletedCount++;
            } catch (err) {
                console.error(`[Backup] Failed to delete ${backup.filename}:`, err);
            }
        }
    }

    if (deletedCount > 0) {
        console.log(`[Backup] Cleaned up ${deletedCount} old backups`);
    }
}

/**
 * Clean up old tenant-scoped snapshots based on retention settings.
 */
export async function cleanOldTenantScopedBackups() {
    const backupSettings = getBackupSettings();
    const envRetention = Number(process.env.BACKUP_TENANT_SNAPSHOT_RETENTION_DAYS || '');
    const retentionDays = Number.isFinite(envRetention) && envRetention > 0
        ? envRetention
        : (backupSettings.retentionDays ?? 30);
    if (retentionDays <= 0) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const snapshots = await listTenantScopedBackups();
    let deletedCount = 0;

    for (const snapshot of snapshots) {
        if (snapshot.createdAt < cutoffDate) {
            try {
                await unlink(snapshot.path);
                try {
                    await unlink(getManifestPath(snapshot.path));
                } catch {
                    // Ignore missing manifest files from older snapshots.
                }
                deletedCount++;
            } catch (err) {
                console.error(`[Backup] Failed to delete tenant snapshot ${snapshot.filename}:`, err);
            }
        }
    }

    if (deletedCount > 0) {
        console.log(`[Backup] Cleaned up ${deletedCount} old tenant snapshots`);
    }
}

/**
 * Clean up old tenant-scoped snapshots for a specific tenant.
 */
export async function cleanOldTenantScopedBackupsForTenant(tenantId: string, retentionDays: number) {
    if (!tenantId) return;
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const snapshots = await listTenantScopedBackups(tenantId);
    let deletedCount = 0;

    for (const snapshot of snapshots) {
        if (snapshot.createdAt < cutoffDate) {
            try {
                await unlink(snapshot.path);
                try {
                    await unlink(getManifestPath(snapshot.path));
                } catch {
                    // Ignore missing manifest files from older snapshots.
                }
                deletedCount++;
            } catch (err) {
                console.error(`[Backup] Failed to delete tenant snapshot ${snapshot.filename}:`, err);
            }
        }
    }

    if (deletedCount > 0) {
        console.log(`[Backup] Cleaned up ${deletedCount} old tenant snapshots for tenant ${tenantId}`);
    }
}

/**
 * Start/Update the cron schedule
 */
export function runBackupSchedule() {
    const settings = getBackupSettings();
    const defaults = getDefaultTenantSettings();
    const schedule = parseScheduleTime(settings.scheduleTime);
    const requestedTimezone = settings.timezone || defaults.defaultTimezone || 'UTC';
    const timezone = isValidTimeZone(requestedTimezone) ? requestedTimezone : 'UTC';

    // Stop existing job
    if (backupJob) {
        backupJob.stop();
        backupJob = null;
    }

    if (settings.frequency === 'never') {
        console.log('[Backup] Scheduled backups disabled');
        return;
    }

    // Convert frequency to cron expression
    let cronExpression = '';
    switch (settings.frequency) {
        case 'daily':
            cronExpression = `${schedule.minute} ${schedule.hour} * * *`;
            break;
        case 'weekly':
            cronExpression = `${schedule.minute} ${schedule.hour} * * 0`;
            break;
        case 'monthly':
            cronExpression = `${schedule.minute} ${schedule.hour} 1 * *`;
            break;
        default:
            return;
    }

    try {
        backupJob = new CronJob(cronExpression, async () => {
            console.log('[Backup] Running scheduled backup...');
            const result = await createBackup();
            if (!result.success) {
                console.error(`[Backup] Scheduled backup failed: ${result.error || 'Unknown error'}`);
            } else {
                console.log(`[Backup] Scheduled backup completed: ${result.filename}`);
            }
        }, null, false, timezone);

        backupJob.start();
        if (timezone !== requestedTimezone) {
            console.warn(`[Backup] Invalid timezone "${requestedTimezone}" configured; falling back to UTC`);
        }
        console.log(`[Backup] Schedule updated: ${settings.frequency} at ${settings.scheduleTime || '00:00'} (${timezone}) => ${cronExpression}`);
    } catch (err) {
        console.error('[Backup] Failed to start schedule:', err);
    }
}
