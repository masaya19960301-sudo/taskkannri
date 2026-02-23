/**
 * CacheManager.js
 * CacheServiceを利用したキャッシュ管理
 */

class CacheManager {
  constructor() {
    this._cache = CacheService.getScriptCache();
  }

  /**
   * キャッシュから取得
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    const raw = this._cache.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return raw;
    }
  }

  /**
   * キャッシュに保存
   * @param {string} key
   * @param {*} value
   * @param {number} ttl - 秒数（デフォルト: APP_CONFIG.CACHE_TTL）
   */
  put(key, value, ttl) {
    const effectiveTtl = ttl || APP_CONFIG.CACHE_TTL;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    // CacheServiceの最大値チェック（100KB）
    if (serialized.length > 100000) {
      Logger.log(`CacheManager: key=${key} はサイズ超過のためキャッシュをスキップ`);
      return;
    }
    this._cache.put(key, serialized, effectiveTtl);
  }

  /**
   * キャッシュから削除
   * @param {string} key
   */
  remove(key) {
    this._cache.remove(key);
  }

  /**
   * プレフィックスに一致するキャッシュを一括削除
   * CacheServiceにはprefix削除がないため、既知のキーリストを使って削除
   * @param {string} prefix
   * @param {string[]} knownKeys
   */
  removeByPrefix(prefix, knownKeys) {
    if (!knownKeys) return;
    const keysToRemove = knownKeys.filter(k => k.startsWith(prefix));
    if (keysToRemove.length > 0) {
      this._cache.removeAll(keysToRemove);
    }
  }

  /**
   * 複数キーを一括取得
   * @param {string[]} keys
   * @returns {Object}
   */
  getAll(keys) {
    const raw = this._cache.getAll(keys);
    const result = {};
    Object.keys(raw).forEach(key => {
      try {
        result[key] = JSON.parse(raw[key]);
      } catch (e) {
        result[key] = raw[key];
      }
    });
    return result;
  }

  /**
   * 複数キーを一括保存
   * @param {Object} entries - { key: value }
   * @param {number} ttl
   */
  putAll(entries, ttl) {
    const effectiveTtl = ttl || APP_CONFIG.CACHE_TTL;
    const serialized = {};
    Object.keys(entries).forEach(key => {
      const val = typeof entries[key] === 'string' ? entries[key] : JSON.stringify(entries[key]);
      if (val.length <= 100000) {
        serialized[key] = val;
      }
    });
    if (Object.keys(serialized).length > 0) {
      this._cache.putAll(serialized, effectiveTtl);
    }
  }
}

// シングルトンインスタンス（遅延初期化）
var cacheManager_ = null;

function getCacheManager() {
  if (!cacheManager_) cacheManager_ = new CacheManager();
  return cacheManager_;
}
