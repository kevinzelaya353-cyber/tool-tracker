import type { PrismaClient } from "@prisma/client";
import type { RefreshTokenStore } from "./token.service.js";

export function prismaRefreshStore(prisma: PrismaClient): RefreshTokenStore {
  return {
    findByHash: (tokenHash) =>
      prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, family: true, expiresAt: true, revokedAt: true },
      }),

    create: async (data) => {
      await prisma.refreshToken.create({ data });
    },

    revokeIfActive: async (id) => {
      const { count } = await prisma.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return count === 1;
    },

    revokeFamily: async (family) => {
      await prisma.refreshToken.updateMany({
        where: { family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },

    revokeAllForUser: async (userId) => {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}
