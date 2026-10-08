import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AppData, Driver, FuelLog, Report } from '../../lib/types';
import type { Api } from './api';
import { loadDriverId, saveDriverId } from './session';

type Ctx = {
  api: Api;
  data: AppData | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  currentDriver: Driver | null;
  // 運転者としてログイン済みなら after をすぐ実行し、未ログインならログイン画面を開いて、ログイン後に実行する
  requireDriver: (after: (d: Driver) => void) => void;
  loginOpen: boolean;
  closeLogin: () => void;
  openLogin: () => void;
  selectDriver: (d: Driver) => void;
  logoutDriver: () => void;
  saveReport: (r: Report) => Promise<void>;
  saveFuelLog: (f: FuelLog) => Promise<void>;
  resetServer: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider の中で使ってください。');
  return c;
}

export const errorMessage = (e: unknown): string => (e instanceof Error && e.message ? e.message : '保存できませんでした。');

export function AppProvider({ api, onResetServer, children }: { api: Api; onResetServer: () => void; children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const afterLogin = useRef<((d: Driver) => void) | null>(null);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setRefreshing(true);
      try {
        setData(await api.loadData());
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    loadDriverId().then(setDriverId);
    load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);
  const currentDriver = data?.drivers.find((d) => d.id === driverId) ?? null;

  function requireDriver(after: (d: Driver) => void) {
    if (currentDriver) return after(currentDriver);
    afterLogin.current = after;
    setLoginOpen(true);
  }
  function selectDriver(d: Driver) {
    setDriverId(d.id);
    saveDriverId(d.id);
    setLoginOpen(false);
    const next = afterLogin.current;
    afterLogin.current = null;
    next?.(d);
  }
  function closeLogin() {
    afterLogin.current = null;
    setLoginOpen(false);
  }
  function logoutDriver() {
    setDriverId(null);
    saveDriverId(null);
  }

  // 保存したあと、最新のデータに静かに更新する（保存そのものが成功していれば、更新に失敗しても保存の失敗にはしない）
  async function saveReport(r: Report) {
    await api.saveReport(r);
    await load(false);
  }
  async function saveFuelLog(f: FuelLog) {
    await api.saveFuelLog(f);
    await load(false);
  }

  return (
    <AppCtx.Provider
      value={{
        api,
        data,
        loading,
        refreshing,
        error,
        refresh,
        currentDriver,
        requireDriver,
        loginOpen,
        closeLogin,
        openLogin: () => {
          afterLogin.current = null;
          setLoginOpen(true);
        },
        selectDriver,
        logoutDriver,
        saveReport,
        saveFuelLog,
        resetServer: onResetServer,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}
