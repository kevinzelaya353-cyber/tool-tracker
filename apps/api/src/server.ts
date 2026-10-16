import path from "node:path";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { localFilesRouter, localStorage } from "./modules/media/local-storage.js";
import { MediaService } from "./modules/media/media.service.js";
import { s3Storage, type ObjectStorage } from "./modules/media/storage.js";

const env = loadEnv();

let storage: ObjectStorage;
let filesRouter: ReturnType<typeof localFilesRouter> | undefined;

if (env.STORAGE_DRIVER === "s3") {
  const s3 = s3Storage({
    endpoint: env.S3_ENDPOINT!,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY!,
    secretAccessKey: env.S3_SECRET_KEY!,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  if (env.NODE_ENV !== "production") await s3.ensureBucket();
  storage = s3;
} else {
  const dir = path.resolve(env.LOCAL_STORAGE_DIR);
  // Clave de firma derivada (no se reutiliza tal cual el secreto de los JWT).
  const signingSecret = `${env.JWT_ACCESS_SECRET}:files`;
  storage = localStorage({ dir, publicBaseUrl: env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`, signingSecret });
  filesRouter = localFilesRouter({ dir, signingSecret });
  console.log(`Fotos en disco: ${dir}`);
}

const app = createApp(env, { prisma, storage, filesRouter });

const server = app.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}`);
  if (env.API_PUBLIC_URL) console.log(`Desde el teléfono: ${env.API_PUBLIC_URL}`);
});

// Purga horaria de fotos subidas que nunca se asociaron a un traslado o evento.
const media = new MediaService(prisma, storage, {
  urlTtlSec: env.MEDIA_URL_TTL_SEC,
  orphanTtlHours: env.MEDIA_ORPHAN_TTL_HOURS,
});
const purgeTimer = setInterval(() => {
  media
    .purgeOrphans()
    .then((n) => n > 0 && console.log(`Fotos huérfanas eliminadas: ${n}`))
    .catch((err) => console.error("Error purgando fotos huérfanas", err));
}, 3_600_000);
purgeTimer.unref();

async function shutdown() {
  clearInterval(purgeTimer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
