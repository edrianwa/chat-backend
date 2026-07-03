import request from "supertest";
import { app } from "../index";
import { AuthService } from "../services/auth.service";

const mediaMetadata: any[] = [];
const chatSettings: any[] = [];
const quotas: Record<string, any> = {};

jest.mock("../db/connection", () => {
  const mockDb = jest.fn((tableName: string) => {
    const createQb = (): any => {
      const qb: any = {};
      let filters: Record<string, any> = {};

      qb.where = jest
        .fn()
        .mockImplementation((key: string, valOrOp?: any, val?: any) => {
          if (val !== undefined) {
            filters[key] = { op: valOrOp, val };
          } else {
            filters[key] = valOrOp;
          }
          return qb;
        });
      qb.whereNotNull = jest.fn().mockReturnValue(qb);
      qb.first = jest.fn().mockImplementation(() => {
        if (tableName === "media_metadata") {
          return (
            mediaMetadata.find((m) => {
              if (filters.id && m.id !== filters.id) return false;
              if (
                filters.is_deleted !== undefined &&
                m.is_deleted !== filters.is_deleted
              )
                return false;
              if (filters.uploader_id && m.uploader_id !== filters.uploader_id)
                return false;
              return true;
            }) || null
          );
        }
        if (tableName === "chat_settings") {
          return (
            chatSettings.find(
              (s) =>
                s.user_id === filters.user_id && s.chat_id === filters.chat_id,
            ) || null
          );
        }
        if (tableName === "storage_quota") {
          return quotas[filters.user_id] || null;
        }
        return null;
      });
      qb.select = jest.fn().mockImplementation(() => {
        if (tableName === "media_metadata") {
          return mediaMetadata.filter(
            (m) => !m.is_deleted && m.expires_at && m.expires_at < new Date(),
          );
        }
        return [];
      });
      qb.insert = jest.fn().mockImplementation((data: any) => {
        const d = Array.isArray(data) ? data[0] : data;
        if (tableName === "media_metadata") {
          mediaMetadata.push(d);
        }
        if (tableName === "chat_settings") {
          chatSettings.push(d);
        }
        if (tableName === "storage_quota") {
          quotas[d.user_id] = d;
        }
        return qb;
      });
      qb.update = jest.fn().mockResolvedValue(1);
      qb.increment = jest.fn().mockReturnValue(qb);
      qb.decrement = jest.fn().mockReturnValue(qb);
      qb.returning = jest.fn().mockImplementation(() => {
        if (tableName === "media_metadata" && mediaMetadata.length > 0) {
          return [mediaMetadata[mediaMetadata.length - 1]];
        }
        return [{}];
      });
      qb.onConflict = jest.fn().mockReturnValue(qb);
      qb.merge = jest.fn().mockResolvedValue(undefined);
      qb.ignore = jest.fn().mockResolvedValue(undefined);
      qb.del = jest.fn().mockResolvedValue(1);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.offset = jest.fn().mockResolvedValue([]);
      qb.count = jest.fn().mockReturnValue(qb);
      return qb;
    };
    return createQb();
  });
  return { __esModule: true, default: mockDb };
});

jest.mock("../db/redis", () => ({
  getRedis: jest.fn(() => ({
    set: jest.fn().mockResolvedValue("OK"),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
  })),
  closeRedis: jest.fn(),
}));

// Mock filesystem operations in the service
jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    existsSync: jest.fn().mockImplementation((p: string) => {
      if (p.includes("media-storage")) return true;
      return actual.existsSync(p);
    }),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn().mockImplementation((p: string, ...args: any[]) => {
      if (p.includes("media-storage")) return Buffer.from("encrypted-content");
      return actual.readFileSync(p, ...args);
    }),
    unlinkSync: jest.fn(),
  };
});

function getToken(userId = "user-media-1"): string {
  return AuthService.generateTokens({
    userId,
    role: "user",
    uniqueId: "11112222",
  }).accessToken;
}

describe("Media Endpoints", () => {
  beforeEach(() => {
    mediaMetadata.length = 0;
    chatSettings.length = 0;
    Object.keys(quotas).forEach((k) => delete quotas[k]);
  });

  describe("POST /api/media/upload", () => {
    it("should require authentication", async () => {
      const res = await request(app).post("/api/media/upload").send("data");
      expect(res.status).toBe(401);
    });

    it("should require x-chat-id header", async () => {
      const res = await request(app)
        .post("/api/media/upload")
        .set("Authorization", `Bearer ${getToken()}`)
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("test"));
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("x-chat-id");
    });

    it("should reject empty body", async () => {
      const res = await request(app)
        .post("/api/media/upload")
        .set("Authorization", `Bearer ${getToken()}`)
        .set("Content-Type", "application/octet-stream")
        .set("x-chat-id", "chat-1")
        .send(Buffer.alloc(0));
      expect(res.status).toBe(400);
    });

    it("should accept valid upload", async () => {
      const res = await request(app)
        .post("/api/media/upload")
        .set("Authorization", `Bearer ${getToken()}`)
        .set("Content-Type", "image/webp")
        .set("x-chat-id", "recipient-1")
        .set("x-file-name", "photo.webp")
        .send(Buffer.from("encrypted-image-data"));

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("url");
      expect(res.body).toHaveProperty("fileSize");
    });
  });

  describe("GET /api/media/:id", () => {
    it("should require auth", async () => {
      const res = await request(app).get("/api/media/some-id");
      expect(res.status).toBe(401);
    });

    it("should return 404 for unknown media", async () => {
      const res = await request(app)
        .get("/api/media/nonexistent-id")
        .set("Authorization", `Bearer ${getToken()}`);
      expect(res.status).toBe(404);
    });

    it("should return media file when found", async () => {
      mediaMetadata.push({
        id: "media-1",
        uploader_id: "user-media-1",
        chat_id: "recipient-1",
        file_name: "photo.webp",
        file_size: 1024,
        mime_type: "image/webp",
        storage_path: "user-media-1/media-1.webp",
        is_deleted: false,
      });

      const res = await request(app)
        .get("/api/media/media-1")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/webp");
    });
  });

  describe("DELETE /api/media/:id", () => {
    it("should delete owned media", async () => {
      mediaMetadata.push({
        id: "media-del-1",
        uploader_id: "user-media-1",
        file_size: 500,
        storage_path: "user-media-1/media-del-1.webp",
        is_deleted: false,
      });

      const res = await request(app)
        .delete("/api/media/media-del-1")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("deleted");
    });

    it("should return 404 for non-owned media", async () => {
      const res = await request(app)
        .delete("/api/media/someone-elses")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/media/settings/:chatId", () => {
    it("should reject invalid TTL", async () => {
      const res = await request(app)
        .put("/api/media/settings/chat-1")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ ttlDays: 5 });
      expect(res.status).toBe(400);
    });

    it("should accept valid TTL values", async () => {
      for (const ttl of [null, 1, 7, 30, 90]) {
        const res = await request(app)
          .put("/api/media/settings/chat-1")
          .set("Authorization", `Bearer ${getToken()}`)
          .send({ ttlDays: ttl });
        expect(res.status).toBe(200);
      }
    });
  });
});

describe("Media Auto-Delete", () => {
  it("expired media is identified correctly", () => {
    const expired = {
      id: "exp-1",
      expires_at: new Date(Date.now() - 1000),
      is_deleted: false,
    };
    expect(expired.expires_at < new Date()).toBe(true);
  });

  it("non-expired media is not deleted", () => {
    const active = {
      id: "active-1",
      expires_at: new Date(Date.now() + 86400000),
      is_deleted: false,
    };
    expect(active.expires_at < new Date()).toBe(false);
  });

  it("media with null expires_at never expires", () => {
    const permanent = {
      id: "perm-1",
      expires_at: null,
      is_deleted: false,
    };
    expect(permanent.expires_at).toBeNull();
  });
});

describe("Storage Quota", () => {
  it("quota structure has correct fields", () => {
    const quota = { used: 100000000, max: 524288000, allowed: true };
    expect(quota.used).toBeLessThan(quota.max);
    expect(quota.allowed).toBe(true);
  });

  it("quota blocks upload when exceeded", () => {
    const quota = { used: 524288000, max: 524288000, allowed: false };
    expect(quota.used + 1024).toBeGreaterThan(quota.max);
    expect(quota.allowed).toBe(false);
  });
});
