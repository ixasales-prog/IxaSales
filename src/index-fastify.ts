import "dotenv/config";
console.log("IxaSales API Starting...");
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import multipart from "@fastify/multipart";
import formbody from "@fastify/formbody";
import path from "path";

import { authPlugin } from "./lib/auth-fastify";
import { requestLoggerPlugin } from "./lib/request-logger-fastify";
import { timerMiddleware, createMonitoringRoutes } from "./lib/performance-monitoring";

// Import migrated route modules
import { authRoutes } from "./routes-fastify/auth";
import { orderRoutes } from "./routes-fastify/orders";
import { customerRoutes } from "./routes-fastify/customers";
import { customerRegistrationRoutes } from "./routes-fastify/customer-registrations";
import { productRoutes } from "./routes-fastify/products";
import { visitRoutes } from "./routes-fastify/visits";
import { inventoryRoutes } from "./routes-fastify/inventory";
import { paymentRoutes } from "./routes-fastify/payments";
import { moneyTransferRoutes } from "./routes-fastify/money-transfers";
import { userRoutes } from "./routes-fastify/users";
import { deliveryRoutes } from "./routes-fastify/delivery";
import { discountRoutes } from "./routes-fastify/discounts";
import { returnRoutes } from "./routes-fastify/returns";
import { reportRoutes } from "./routes-fastify/reports";
import { notificationRoutes } from "./routes-fastify/notifications";
import { tenantRoutes } from "./routes-fastify/tenants";
import { tenantSelfRoutes } from "./routes-fastify/tenant-self";
import { procurementRoutes } from "./routes-fastify/procurement";
import { uploadRoutes } from "./routes-fastify/uploads";
import { imageRoutes } from "./routes-fastify/images";
import { superRoutes } from "./routes-fastify/super";
import { paymentGatewayRoutes } from "./routes-fastify/payment-gateway";
import { telegramWebhookRoutes } from "./routes-fastify/telegram-webhook";
import { customerPortalRoutes } from "./routes-fastify/customer-portal";
import { gpsTrackingRoutes } from "./routes-fastify/gps-tracking";
import userActivityRoutes from "./routes-fastify/user-activity";
import { supervisorRoutes } from "./routes-fastify/supervisor";
import { warehouseRoutes } from "./routes-fastify/warehouse";
import { batchOrderRoutes } from "./routes-fastify/batch-orders";
import { territoryRoutes } from "./routes-fastify/territories";

// Initialize Redis rate limiter (if REDIS_URL is set)
import { initRedisRateLimiter } from "./lib/rate-limit";
import { securityHeaders, rateLimit } from "./lib/security-middleware";
initRedisRateLimiter().catch(console.error);

// Payroll rate limit: 60 req/min per IP (runs before auth, so we use IP)
const payrollIpRateLimit = rateLimit({
  max: 60,
  windowMs: 60 * 1000,
  keyGenerator: (req) => `payroll:${req.ip || "unknown"}`,
});

export const buildServer = async (): Promise<FastifyInstance> => {
  const fastify = Fastify({
    logger:
      process.env.NODE_ENV === "development"
        ? {
          transport: {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          },
        }
        : true,
  });

  const createOriginMatcher = (allowedOrigins: string[], allowedSuffixes: string[]) => {
    const normalizedOrigins = new Set(
      allowedOrigins.map((origin) => origin.replace(/\/$/, "")),
    );
    const normalizedSuffixes = allowedSuffixes
      .map((suffix) => suffix.trim().toLowerCase())
      .filter(Boolean);

    return (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        cb(null, true);
        return;
      }

      try {
        const url = new URL(origin);
        const normalizedOrigin = origin.replace(/\/$/, "");
        const hostname = url.hostname.toLowerCase();
        const suffixAllowed = url.protocol === "https:" && normalizedSuffixes.some((suffix) =>
          hostname === suffix.replace(/^\./, "") || hostname.endsWith(suffix)
        );

        cb(null, normalizedOrigins.has(normalizedOrigin) || suffixAllowed);
      } catch {
        cb(new Error(`Invalid origin: ${origin}`), false);
      }
    };
  };

  // CORS configuration - Enforce production-ready CORS policy
  const corsConfig = (() => {
    if (process.env.NODE_ENV === "development") {
      // For development environments, allow specific origins or localhost
      const raw = process.env.CORS_ORIGIN;
      if (!raw || raw.trim() === "") {
        console.log("✓ Development mode: Using default development origins");
        const defaults = ["http://localhost:5173", "http://localhost:3000"];
        return {
          debugOrigins: defaults,
          debugSuffixes: [] as string[],
          origin: defaults,
        };
      }

      const origins = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (origins.length === 0) {
        console.log("✓ Development mode: Using default development origins");
        const defaults = ["http://localhost:5173", "http://localhost:3000"];
        return {
          debugOrigins: defaults,
          debugSuffixes: [] as string[],
          origin: defaults,
        };
      }

      // Validate origins for development mode
      const validatedOrigins = origins.map((origin) => {
        try {
          const url = new URL(origin);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("Invalid protocol");
          }
          return origin;
        } catch (e) {
          console.error(
            `❌ Invalid CORS origin: ${origin}. Must be a valid URL with http or https protocol.`,
          );
          process.exit(1);
        }
      });

      console.log(
        `✓ CORS configured for origins: ${validatedOrigins.join(", ")}`,
      );
      return {
        debugOrigins: validatedOrigins,
        debugSuffixes: [] as string[],
        origin: validatedOrigins,
      };
    }

    // Production mode - must have explicit, validated configuration
    const raw = process.env.CORS_ORIGIN;
    if (!raw || raw.trim() === "") {
      console.error(
        "❌ CRITICAL: CORS_ORIGIN not set in production - refusing to start server",
      );
      console.error(
        "💡 HINT: Set CORS_ORIGIN in your .env file with HTTPS origins only (comma-separated)",
      );
      process.exit(1);
    }

    const origins = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (origins.length === 0) {
      console.error(
        "❌ CRITICAL: CORS_ORIGIN is empty in production - refusing to start server",
      );
      console.error(
        "💡 HINT: Set CORS_ORIGIN in your .env file with HTTPS origins only (comma-separated)",
      );
      process.exit(1);
    }

    const suffixes = (process.env.CORS_ORIGIN_SUFFIXES || ".ixasales.uz")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Validate origins - reject wildcard origins in production
    const validatedOrigins = origins.map((origin) => {
      if (origin === "*" || origin === '"*"') {
        console.error(
          `❌ REJECTED: Wildcard origin '*' is not allowed in production for security reasons.`,
        );
        console.error(
          "💡 HINT: Use explicit HTTPS origins like CORS_ORIGIN=https://example.com,https://app.example.com",
        );
        process.exit(1);
      }

      try {
        const url = new URL(origin);
        if (url.protocol !== "https:") {
          console.error(
            `❌ REJECTED: Non-HTTPS origin '${origin}' is not allowed in production for security reasons.`,
          );
          console.error(
            "💡 HINT: Use HTTPS origins only (e.g., CORS_ORIGIN=https://example.com)",
          );
          process.exit(1);
        }

        // Normalize origin by removing trailing slash
        return origin.replace(/\/$/, "");
      } catch (e) {
        console.error(
          `❌ Invalid CORS origin: ${origin}. Must be a valid URL with https protocol.`,
        );
        console.error(
          "💡 HINT: Format as HTTPS URL (e.g., CORS_ORIGIN=https://example.com)",
        );
        process.exit(1);
      }
    });

    const validatedSuffixes = suffixes.map((suffix) => {
      if (!suffix.startsWith(".")) {
        console.error(
          `❌ Invalid CORS origin suffix: ${suffix}. Expected values like .ixasales.uz`,
        );
        process.exit(1);
      }
      return suffix.toLowerCase();
    });

    console.log(
      `✓ CORS configured for origins: ${validatedOrigins.join(", ")}`,
    );
    console.log(
      `✓ CORS configured for suffixes: ${validatedSuffixes.join(", ")}`,
    );
    return {
      debugOrigins: validatedOrigins,
      debugSuffixes: validatedSuffixes,
      origin: createOriginMatcher(validatedOrigins, validatedSuffixes),
    };
  })();

  await fastify.register(cors, {
    origin: corsConfig.origin,
    credentials: true,
    methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "X-Total-Count",
    ],
    exposedHeaders: ["X-Total-Count"],
  });

  // Form body parser
  await fastify.register(formbody);

  // Multipart for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // Static file serving for uploads
  await fastify.register(staticPlugin, {
    root: path.join(process.cwd(), "uploads"),
    prefix: "/uploads/",
    decorateReply: false,
  });

  // Security headers
  fastify.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "1; mode=block");
    if (process.env.NODE_ENV === "production") {
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    return payload;
  });

  // Request logging (in development)
  if (process.env.NODE_ENV === "development") {
    fastify.addHook("onRequest", async (request, reply) => {
      console.log(`→ ${request.method} ${request.url}`);
    });
  }

  // Performance monitoring middleware
  fastify.addHook("onRequest", timerMiddleware(fastify));

  // Health check endpoint with CORS debug info
  fastify.get("/health", async (request) => {
    const showDebug = request.query && (request.query as any).debug === "true";
    const response: Record<string, unknown> = {
      status: "ok",
      timestamp: new Date().toISOString(),
      node_env: process.env.NODE_ENV,
    };

    // Show CORS info in development or when debug=true
    if (process.env.NODE_ENV === "development" || showDebug) {
      response.cors = {
        configured_origins: corsConfig.debugOrigins,
        configured_suffixes: corsConfig.debugSuffixes,
        env_var_set: !!process.env.CORS_ORIGIN,
        env_var_value: process.env.CORS_ORIGIN
          ? process.env.CORS_ORIGIN.substring(0, 50)
          : null,
      };
    }

    return response;
  });

  // Root endpoint
  fastify.get("/", async () => ({
    success: true,
    message: "IxaSales Distribution ERP API is running",
    documentation: "/api",
    health: "/health",
  }));

  // Public announcement endpoint
  fastify.get("/api/announcement", async () => {
    try {
      const { getAnnouncementSettings } = await import("./lib/systemSettings");
      return { success: true, data: getAnnouncementSettings() };
    } catch (error) {
      console.error("[API] Error fetching announcement settings:", error);
      return { success: false, error: "Failed to fetch announcement settings" };
    }
  });

  // Public branding endpoint
  fastify.get("/api/branding", async (request, reply) => {
    try {
      console.log("[API] Fetching branding settings...");
      // Explicitly try catch the import to see if that's the point of failure
      let getBrandingSettings;
      try {
        const module = await import("./lib/systemSettings");
        getBrandingSettings = module.getBrandingSettings;
      } catch (importError: any) {
        console.error("[API] Failed to import systemSettings:", importError);
        throw new Error(`System settings import failed: ${importError.message}`);
      }

      if (!getBrandingSettings) {
        throw new Error("getBrandingSettings not found in module");
      }

      const branding = getBrandingSettings();
      console.log("[API] Branding settings fetched success");
      return { success: true, data: branding };
    } catch (error: any) {
      console.error("[API] Error fetching branding settings:", error);
      // Return default branding on error with 200 OK so frontend doesn't crash
      return {
        success: true,
        data: {
          platformName: "IxaSales",
          primaryColor: "#3B82F6",
          logoUrl: "",
        },
      };
    }
  });

  // Register auth plugin globally for /api routes
  console.log("Registering auth plugin:", authPlugin);
  await fastify.register(authPlugin);

  console.log("Auth plugin registered. fastify.authenticate is:", typeof fastify.authenticate);

  // Register Request Logger
  await fastify.register(requestLoggerPlugin);

  // API routes (will be migrated incrementally)
  await fastify.register(
    async (api) => {
      // Register performance monitoring routes (admin only)
      await createMonitoringRoutes(api);

      // Display settings endpoint
      console.log("Registering display-settings...");
      api.get(
        "/display-settings",
        {
          preHandler: [async (req, rep) => {
            if (fastify.authenticate) {
              await fastify.authenticate(req, rep);
            } else {
              console.error("CRITICAL: fastify.authenticate is undefined during request!");
              throw new Error("Authentication middleware missing");
            }
          }],
        },
        async (request, reply) => {
          // ... (keep implementation)
          const user = request.user;
          if (!user || !user.tenantId) {
            return {
              success: true,
              data: {
                currency: "",
                timezone: "Asia/Tashkent",
                yandexGeocoderApiKey: "",
              },
            };
          }

          const { db, schema } = await import("./db/index");
          const { eq } = await import("drizzle-orm");

          const [tenant] = await db
            .select({
              currency: schema.tenants.currency,
              timezone: schema.tenants.timezone,
              yandexGeocoderApiKey: schema.tenants.yandexGeocoderApiKey,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

          return {
            success: true,
            data: {
              currency: tenant?.currency ?? "",
              timezone: tenant?.timezone ?? "Asia/Tashkent",
              yandexGeocoderApiKey: tenant?.yandexGeocoderApiKey ?? "",
            },
          };
        }
      );

      // Helper to register routes safely
      const safeRegister = async (
        plugin: any,
        opts: any,
        name: string,
        options?: { required?: boolean },
      ) => {
        const required = options?.required !== false;
        try {
          console.log(`Registering ${name}...`);
          await api.register(plugin, opts);
          console.log(`${name} registered successfully.`);
        } catch (err) {
          console.error(`FAILED to register ${name}:`, err);
          if (required) throw err;
        }
      };

      // Register route modules
      await safeRegister(authRoutes, { prefix: "/auth" }, "authRoutes");
      await safeRegister(orderRoutes, { prefix: "/orders" }, "orderRoutes");
      await safeRegister(customerRoutes, { prefix: "/customers" }, "customerRoutes");
      await safeRegister(customerRegistrationRoutes, { prefix: "/customers" }, "customerRegistrationRoutes");
      await safeRegister(productRoutes, { prefix: "/products" }, "productRoutes");
      await safeRegister(visitRoutes, { prefix: "/visits" }, "visitRoutes");
      await safeRegister(inventoryRoutes, { prefix: "/inventory" }, "inventoryRoutes");
      await safeRegister(paymentRoutes, { prefix: "/payments" }, "paymentRoutes");
      await safeRegister(moneyTransferRoutes, { prefix: "/money-transfers" }, "moneyTransferRoutes");
      await safeRegister(userRoutes, { prefix: "/users" }, "userRoutes");

      try {
        const { userTelegramLinkRoutes } = await import("./routes-fastify/user-telegram-link");
        await safeRegister(userTelegramLinkRoutes, { prefix: "/users" }, "userTelegramLinkRoutes");
      } catch (e) {
        console.error("Failed to import userTelegramLinkRoutes", e);
      }

      await safeRegister(deliveryRoutes, { prefix: "/delivery" }, "deliveryRoutes");
      await safeRegister(discountRoutes, { prefix: "/discounts" }, "discountRoutes");
      await safeRegister(returnRoutes, { prefix: "/returns" }, "returnRoutes");
      await safeRegister(reportRoutes, { prefix: "/reports" }, "reportRoutes");
      await safeRegister(notificationRoutes, { prefix: "/notifications" }, "notificationRoutes");
      await safeRegister(tenantRoutes, { prefix: "/super/tenants" }, "tenantRoutes");
      await safeRegister(tenantSelfRoutes, { prefix: "/tenant" }, "tenantSelfRoutes");
      await safeRegister(procurementRoutes, { prefix: "/procurement" }, "procurementRoutes");
      await safeRegister(supervisorRoutes, { prefix: "/supervisor" }, "supervisorRoutes");
      await safeRegister(warehouseRoutes, { prefix: "/warehouse" }, "warehouseRoutes");
      await safeRegister(uploadRoutes, { prefix: "/uploads" }, "uploadRoutes");
      await safeRegister(imageRoutes, { prefix: "/images" }, "imageRoutes");
      await safeRegister(superRoutes, { prefix: "/super" }, "superRoutes");
      await safeRegister(paymentGatewayRoutes, { prefix: "/payment-gateway" }, "paymentGatewayRoutes");
      await safeRegister(telegramWebhookRoutes, { prefix: "/telegram" }, "telegramWebhookRoutes");

      // Customer Portal
      try {
        await safeRegister(customerPortalRoutes, { prefix: "/customer-portal" }, "customerPortalRoutes");
      } catch (e) {
        console.error("Failed to register customerPortalRoutes", e);
      }

      await safeRegister(gpsTrackingRoutes, { prefix: "/gps-tracking" }, "gpsTrackingRoutes");
      await safeRegister(userActivityRoutes, { prefix: "/user-activity" }, "userActivityRoutes");
      await safeRegister(batchOrderRoutes, { prefix: "/batch-orders" }, "batchOrderRoutes");
      await safeRegister(territoryRoutes, { prefix: "/territories" }, "territoryRoutes");

      // Payroll routes (with rate limiting and security headers)
      try {
        await api.register(
          async (payrollScope) => {
            payrollScope.addHook("onRequest", securityHeaders);
            payrollScope.addHook("preHandler", payrollIpRateLimit);
            await payrollScope.register((await import("./routes-fastify/payroll-salaries")).default, { prefix: "/payroll" });
            await payrollScope.register((await import("./routes-fastify/payroll-commissions")).default, { prefix: "/payroll" });
            await payrollScope.register((await import("./routes-fastify/payroll-benefits")).default, { prefix: "/payroll" });
            await payrollScope.register((await import("./routes-fastify/payroll-processing")).default, { prefix: "/payroll" });
            await payrollScope.register((await import("./routes-fastify/payroll-monitoring")).default, { prefix: "/payroll" });
            await payrollScope.register((await import("./routes-fastify/payroll-security")).default, { prefix: "/payroll" });
            await payrollScope.register((await import("./routes-fastify/payroll-kpis")).default, { prefix: "/payroll" });
            await payrollScope.register((await import("./routes-fastify/payroll-run")).default, { prefix: "/payroll" });
            // Simple quick-run endpoint for one-click payroll processing
            await payrollScope.register((await import("./routes-fastify/payroll-quick-run")).default, { prefix: "/payroll" });
          }
        );
      } catch (e) {
        console.error("Failed to load payroll routes", e);
      }
    },
    { prefix: "/api" },
  );

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    const err = error as any;
    console.error(`[ERROR] ${err.message}`, err);

    if (err.validation) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: err.message,
        },
      });
    }

    const statusCode = err.statusCode || 500;
    return reply.code(statusCode).send({
      success: false,
      error: {
        code: statusCode === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
        message:
          process.env.NODE_ENV === "development"
            ? err.message
            : "An unexpected error occurred",
      },
    });
  });

  // 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Resource not found",
      },
    });
  });

  return fastify;
};

// Start server
const start = async () => {
  try {
    const fastify = await buildServer();
    const port = parseInt(process.env.PORT || "3000", 10);
    const host = "0.0.0.0";

    // Load persisted system settings before any services read cached defaults.
    const { loadSettingsFromDB } = await import("./lib/systemSettings");
    await loadSettingsFromDB();

    await fastify.listen({ port, host });

    // Initialize backup service
    const { initBackupService } = await import("./lib/backup");
    await initBackupService();

    // Initialize tenant export/backup scheduler
    const { initExportService } = await import("./lib/tenant-export");
    await initExportService();

    // Initialize scheduler
    const { initializeScheduler } = await import("./lib/scheduler");
    initializeScheduler();

    // Initialize session cleanup
    const { initializeSessionCleanup } = await import("./lib/session-cleanup");
    initializeSessionCleanup();

    console.log(`
🚀 IxaSales API (Fastify) is running at http://${host}:${port}
        `);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}


