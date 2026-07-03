import db from "../db/connection";

export class AdminService {
  /**
   * Get a setting value by key.
   */
  static async getSetting(key: string): Promise<string | null> {
    const row = await db("admin_settings").where("key", key).first();
    return row?.value || null;
  }

  /**
   * Update a setting value.
   */
  static async updateSetting(key: string, value: string): Promise<void> {
    await db("admin_settings")
      .insert({ key, value, updated_at: new Date() })
      .onConflict("key")
      .merge();
  }

  /**
   * Get all settings.
   */
  static async getAllSettings(): Promise<Record<string, string>> {
    const rows = await db("admin_settings").select("*");
    const settings: Record<string, string> = {};
    if (!rows || !Array.isArray(rows)) return settings;
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  /**
   * Check if user registration is within the cap.
   */
  static async isWithinUserCap(currentUserCount: number): Promise<boolean> {
    const cap = await this.getSetting("user_cap");
    if (!cap) return true;
    return currentUserCount < parseInt(cap, 10);
  }
}
