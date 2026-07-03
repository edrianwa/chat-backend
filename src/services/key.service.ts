import db from '../db/connection';

export interface KeyBundle {
  identityKey: string;
  registrationId: number;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
}

export interface FetchedKeyBundle {
  identityKey: string;
  registrationId: number;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKey: {
    keyId: number;
    publicKey: string;
  } | null;
}

export class KeyService {
  /**
   * Store a full key bundle uploaded during registration.
   */
  static async uploadBundle(userId: string, bundle: KeyBundle): Promise<void> {
    await db.transaction(async (trx) => {
      // Upsert identity key
      await trx('identity_keys')
        .insert({
          user_id: userId,
          public_key: bundle.identityKey,
          registration_id: bundle.registrationId,
        })
        .onConflict('user_id')
        .merge({
          public_key: bundle.identityKey,
          registration_id: bundle.registrationId,
          updated_at: new Date(),
        });

      // Mark old signed pre-keys as not current
      await trx('signed_pre_keys')
        .where('user_id', userId)
        .update({ is_current: false });

      // Insert new signed pre-key
      await trx('signed_pre_keys').insert({
        user_id: userId,
        key_id: bundle.signedPreKey.keyId,
        public_key: bundle.signedPreKey.publicKey,
        signature: bundle.signedPreKey.signature,
        is_current: true,
      });

      // Insert one-time pre-keys
      if (bundle.oneTimePreKeys.length > 0) {
        const rows = bundle.oneTimePreKeys.map((key) => ({
          user_id: userId,
          key_id: key.keyId,
          public_key: key.publicKey,
          is_used: false,
        }));
        await trx('one_time_pre_keys').insert(rows).onConflict(['user_id', 'key_id']).ignore();
      }
    });
  }

  /**
   * Fetch a user's key bundle for initiating a session.
   * Consumes one one-time pre-key (marks it as used).
   */
  static async fetchBundle(userId: string): Promise<FetchedKeyBundle | null> {
    // Get identity key
    const identity = await db('identity_keys').where('user_id', userId).first();
    if (!identity) return null;

    // Get current signed pre-key
    const signedPreKey = await db('signed_pre_keys')
      .where('user_id', userId)
      .where('is_current', true)
      .first();
    if (!signedPreKey) return null;

    // Get and consume one unused one-time pre-key
    let oneTimePreKey = null;
    const otpk = await db('one_time_pre_keys')
      .where('user_id', userId)
      .where('is_used', false)
      .orderBy('key_id', 'asc')
      .first();

    if (otpk) {
      // Mark as used
      await db('one_time_pre_keys')
        .where('id', otpk.id)
        .update({ is_used: true, used_at: new Date() });

      oneTimePreKey = {
        keyId: otpk.key_id,
        publicKey: otpk.public_key,
      };
    }

    return {
      identityKey: identity.public_key,
      registrationId: identity.registration_id,
      signedPreKey: {
        keyId: signedPreKey.key_id,
        publicKey: signedPreKey.public_key,
        signature: signedPreKey.signature,
      },
      oneTimePreKey,
    };
  }

  /**
   * Get count of remaining unused one-time pre-keys for a user.
   */
  static async getPreKeyCount(userId: string): Promise<number> {
    const result = await db('one_time_pre_keys')
      .where('user_id', userId)
      .where('is_used', false)
      .count('* as count')
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  /**
   * Replenish one-time pre-keys.
   */
  static async replenishPreKeys(
    userId: string,
    keys: Array<{ keyId: number; publicKey: string }>
  ): Promise<number> {
    if (keys.length === 0) return 0;

    const rows = keys.map((key) => ({
      user_id: userId,
      key_id: key.keyId,
      public_key: key.publicKey,
      is_used: false,
    }));

    await db('one_time_pre_keys').insert(rows).onConflict(['user_id', 'key_id']).ignore();

    return keys.length;
  }

  /**
   * Check if user's pre-key count is below threshold.
   */
  static readonly LOW_KEY_THRESHOLD = 20;

  static async isPreKeyCountLow(userId: string): Promise<boolean> {
    const count = await this.getPreKeyCount(userId);
    return count < this.LOW_KEY_THRESHOLD;
  }
}
