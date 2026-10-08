import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { ServerConfig } from './api';

// サーバーの設定（Basic認証のパスワードを含むことがある）は、端末の安全な保管領域（Keychain / Keystore）に置く。
// ログイン中の運転者のidは、秘密の情報ではないので通常の保存領域に置く。
const SERVER_KEY = 'fleet_server_config';
const DRIVER_KEY = 'fleet_current_driver_id';

export async function loadServer(): Promise<ServerConfig | null> {
  try {
    const raw = await SecureStore.getItemAsync(SERVER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.baseUrl === 'string' ? (v as ServerConfig) : null;
  } catch {
    return null;
  }
}

export async function saveServer(cfg: ServerConfig): Promise<void> {
  try {
    await SecureStore.setItemAsync(SERVER_KEY, JSON.stringify(cfg));
  } catch {
    // 保存できなくても、このまま使い続けられる（次回の起動で入力し直す）
  }
}

export async function clearServer(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SERVER_KEY);
  } catch {
    // ignore
  }
}

export async function loadDriverId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DRIVER_KEY);
  } catch {
    return null;
  }
}

export async function saveDriverId(id: string | null): Promise<void> {
  try {
    if (id) await AsyncStorage.setItem(DRIVER_KEY, id);
    else await AsyncStorage.removeItem(DRIVER_KEY);
  } catch {
    // ignore
  }
}
