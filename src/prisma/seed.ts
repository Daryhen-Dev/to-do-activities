import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { DEV_USER_ID } from "../lib/current-user";

// Same driver-adapter requirement as src/lib/prisma.ts — see comment there.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEV_USER_EMAIL = "dev@local.test";
const DEV_USER_NAME = "Dev User";

const ITEM_TYPES = [
  {
    key: "tarea",
    name: "Tarea",
    sortOrder: 1,
    isDefault: true,
    requiresCompletion: true,
    allowsRepetition: false,
    allowsProgress: false,
    allowsChecklist: true,
  },
  {
    key: "recordatorio",
    name: "Recordatorio",
    sortOrder: 2,
    isDefault: false,
    requiresCompletion: true,
    allowsRepetition: false,
    allowsProgress: false,
    allowsChecklist: false,
  },
  {
    key: "evento",
    name: "Evento",
    sortOrder: 3,
    isDefault: false,
    requiresCompletion: false,
    allowsRepetition: false,
    allowsProgress: false,
    allowsChecklist: false,
  },
  {
    key: "habito",
    name: "Hábito",
    sortOrder: 4,
    isDefault: false,
    requiresCompletion: true,
    allowsRepetition: true,
    allowsProgress: true,
    allowsChecklist: false,
  },
  {
    key: "objetivo",
    name: "Objetivo",
    sortOrder: 5,
    isDefault: false,
    requiresCompletion: true,
    allowsRepetition: false,
    allowsProgress: true,
    allowsChecklist: true,
  },
  {
    key: "nota",
    name: "Nota",
    sortOrder: 6,
    isDefault: false,
    requiresCompletion: false,
    allowsRepetition: false,
    allowsProgress: false,
    allowsChecklist: false,
  },
] as const;

const PRIORITIES = [
  { key: "baja", name: "Baja", color: "#9CA3AF", sortOrder: 1 },
  { key: "media", name: "Media", color: "#3B82F6", sortOrder: 2 },
  { key: "alta", name: "Alta", color: "#F59E0B", sortOrder: 3 },
  { key: "urgente", name: "Urgente", color: "#EF4444", sortOrder: 4 },
] as const;

const STATUSES = [
  {
    key: "pendiente",
    name: "Pendiente",
    color: "#9CA3AF",
    sortOrder: 1,
    isDefault: true,
  },
  {
    key: "en_progreso",
    name: "En progreso",
    color: "#3B82F6",
    sortOrder: 2,
    isDefault: false,
  },
  {
    key: "pausado",
    name: "Pausado",
    color: "#F59E0B",
    sortOrder: 3,
    isDefault: false,
  },
  {
    key: "completado",
    name: "Completado",
    color: "#22C55E",
    sortOrder: 4,
    isDefault: false,
  },
  {
    key: "cancelado",
    name: "Cancelado",
    color: "#6B7280",
    sortOrder: 5,
    isDefault: false,
  },
  {
    key: "esperando_respuesta",
    name: "Esperando respuesta",
    color: "#A855F7",
    sortOrder: 6,
    isDefault: false,
  },
] as const;

// Categories have no natural unique field besides `id`, so we use fixed,
// deterministic ids (instead of the default `cuid()`) as the idempotent
// upsert target — same pattern as `key` on the other lookup tables.
const CATEGORIES = [
  { id: "dev-cat-trabajo", name: "Trabajo", sortOrder: 1 },
  { id: "dev-cat-personal", name: "Personal", sortOrder: 2 },
  { id: "dev-cat-finanzas", name: "Finanzas", sortOrder: 3 },
  { id: "dev-cat-salud", name: "Salud", sortOrder: 4 },
  { id: "dev-cat-estudios", name: "Estudios", sortOrder: 5 },
  { id: "dev-cat-hogar", name: "Hogar", sortOrder: 6 },
] as const;

async function main() {
  const devUser = await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: { email: DEV_USER_EMAIL, name: DEV_USER_NAME },
    create: { id: DEV_USER_ID, email: DEV_USER_EMAIL, name: DEV_USER_NAME },
  });

  for (const itemType of ITEM_TYPES) {
    await prisma.itemType.upsert({
      where: { key: itemType.key },
      update: itemType,
      create: itemType,
    });
  }

  for (const priority of PRIORITIES) {
    await prisma.priority.upsert({
      where: { key: priority.key },
      update: priority,
      create: priority,
    });
  }

  for (const status of STATUSES) {
    await prisma.status.upsert({
      where: { key: status.key },
      update: status,
      create: status,
    });
  }

  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: {
        name: category.name,
        sortOrder: category.sortOrder,
        userId: devUser.id,
      },
      create: {
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        userId: devUser.id,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
