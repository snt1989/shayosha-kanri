'use client';

import { useEffect, useRef, useState } from 'react';
import { AppData, Driver, EmpIdRule, FuelLog, Masters, Rental, RentalTrip, Report, Reservation, Vehicle } from '@/lib/types';
import Header from './Header';
import StatBar from './StatBar';
import DashboardTab from './DashboardTab';
import ReportsTab from './ReportsTab';
import MaintenanceTab from './MaintenanceTab';
import MechanicLoginModal from './MechanicLoginModal';
import RentalTab from './RentalTab';
import FuelTab from './FuelTab';
import HelpTab from './HelpTab';
import AdminTab from './AdminTab';
import AdminLoginModal from './AdminLoginModal';
import DriverLoginModal from './DriverLoginModal';

type Tab = 'dashboard' | 'reports' | 'maintenance' | 'fuel' | 'rental' | 'help' | 'admin';
type SyncStatus = 'idle' | 'saving' | 'error';
const DRIVER_SESSION_KEY = 'fleet_current_driver_id';
const MECHANIC_SESSION_KEY = 'fleet_current_mechanic';

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: Error & { status?: number } = new Error(body?.message || `リクエストに失敗しました (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export default function FleetApp() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminConfigured, setAdminConfigured] = useState(true);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [quickReportTrigger, setQuickReportTrigger] = useState<number | null>(null);
  const [returnCheckinRequest, setReturnCheckinRequest] = useState<{ id: string; token: number } | null>(null);
  const [currentDriverId, setCurrentDriverId] = useState<string | null>(null);
  const [showDriverLogin, setShowDriverLogin] = useState(false);
  const [mechanicName, setMechanicName] = useState<string | null>(null);
  const [showMechanicLogin, setShowMechanicLogin] = useState(false);
  // 入力操作（出発登録・帰着登録・予約）の途中でログインを求めたときの案内と、ログイン後に続ける操作
  const [driverLoginNotice, setDriverLoginNotice] = useState<string | null>(null);
  const afterDriverLoginRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    load();
    checkAdminSession();
    try {
      const saved = localStorage.getItem(DRIVER_SESSION_KEY);
      if (saved) setCurrentDriverId(saved);
      const m = localStorage.getItem(MECHANIC_SESSION_KEY);
      if (m) setMechanicName(m);
    } catch {
      // ignore（プライベートブラウズ等でlocalStorageが使えない場合は無視）
    }
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await jsonFetch('/api/data');
      setData(d);
      setSyncStatus('idle');
    } catch (e) {
      setError('データの読み込みに失敗しました。ページを再読み込みしてください。');
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  }

  // 保存後にサーバーの最新データへ静かに同期するための再取得。
  // load() と違って画面全体を「読み込み中…」に差し替えず、タブや各画面の
  // 入力途中の状態を保ったままデータだけを更新する。
  async function refreshData() {
    try {
      const d = await jsonFetch('/api/data');
      setData(d);
    } catch {
      // 表示中のデータはそのまま維持し、同期エラー表示のみ行う
      setSyncStatus('error');
    }
  }

  async function checkAdminSession() {
    try {
      const res = await jsonFetch('/api/admin/session');
      setIsAdmin(Boolean(res.isAdmin));
      setAdminConfigured(Boolean(res.configured));
    } catch {
      // ignore
    }
  }

  async function withSync<T>(fn: () => Promise<T>): Promise<T> {
    setSyncStatus('saving');
    try {
      const result = await fn();
      await refreshData();
      setSyncStatus('idle');
      return result;
    } catch (e) {
      setSyncStatus('error');
      throw e;
    }
  }

  async function saveReport(r: Report) {
    try {
      return await withSync(() => jsonFetch('/api/reports', { method: 'POST', body: JSON.stringify(r) }));
    } catch (e) {
      handleAdminApiError(e);
      throw e;
    }
  }
  async function deleteReport(id: string) {
    try {
      return await withSync(() => jsonFetch(`/api/reports/${id}`, { method: 'DELETE' }));
    } catch (e) {
      handleAdminApiError(e);
      throw e;
    }
  }
  // 予約は重複などで失敗する（409）のが通常の動作なので、その場合は「同期エラー」表示にしない
  async function reservationRequest(url: string, init: RequestInit) {
    setSyncStatus('saving');
    try {
      const result = await jsonFetch(url, init);
      await refreshData();
      setSyncStatus('idle');
      return result;
    } catch (e) {
      setSyncStatus((e as { status?: number }).status ? 'idle' : 'error');
      throw e;
    }
  }
  async function saveReservation(r: Reservation) {
    return reservationRequest('/api/reservations', { method: 'POST', body: JSON.stringify(r) });
  }
  async function deleteReservation(id: string) {
    return reservationRequest(`/api/reservations/${id}`, { method: 'DELETE' });
  }
  async function resolveMaintRequest(id: string, done: boolean) {
    return withSync(() => jsonFetch(`/api/reports/${id}/maint-request`, { method: 'POST', body: JSON.stringify({ done }) }));
  }
  async function saveVehicle(v: Vehicle) {
    return withSync(() => jsonFetch('/api/vehicles', { method: 'POST', body: JSON.stringify(v) }));
  }
  async function deleteVehicle(id: string) {
    return withSync(() => jsonFetch(`/api/vehicles/${id}`, { method: 'DELETE' }));
  }
  async function bulkSaveVehicles(list: Vehicle[]) {
    return withSync(() => jsonFetch('/api/vehicles/bulk', { method: 'POST', body: JSON.stringify(list) }));
  }
  async function saveDriver(d: Driver) {
    return withSync(() => jsonFetch('/api/drivers', { method: 'POST', body: JSON.stringify(d) }));
  }
  async function deleteDriver(id: string) {
    return withSync(() => jsonFetch(`/api/drivers/${id}`, { method: 'DELETE' }));
  }
  async function bulkSaveDrivers(list: Driver[]) {
    return withSync(() => jsonFetch('/api/drivers/bulk', { method: 'POST', body: JSON.stringify(list) }));
  }
  function handleAdminApiError(e: unknown) {
    const status = (e as { status?: number } | null)?.status;
    if (status === 401) {
      // 管理者セッションが無効（ログアウト済み・期限切れ・Cookie破棄など）。
      // 画面側の状態を必ず「未ログイン」に合わせ、管理マスタ画面をその場で再ロックする。
      setIsAdmin(false);
      alert('管理者セッションが無効です（ログアウト済み、または期限切れ）。再度ログインしてください。');
    }
  }
  async function saveMasterCategory(category: keyof Masters, items: string[]) {
    try {
      return await withSync(() => jsonFetch('/api/masters', { method: 'POST', body: JSON.stringify({ category, items }) }));
    } catch (e) {
      handleAdminApiError(e);
      throw e;
    }
  }
  async function saveAllMasters(masters: Masters) {
    try {
      return await withSync(() => jsonFetch('/api/masters/all', { method: 'POST', body: JSON.stringify(masters) }));
    } catch (e) {
      handleAdminApiError(e);
      throw e;
    }
  }
  // 編集・削除は管理者のみ。401（管理者ログイン切れ）のときは画面側もログアウト状態に合わせる
  async function rentalAdminCall(fn: () => Promise<unknown>) {
    try {
      return await withSync(fn);
    } catch (e) {
      handleAdminApiError(e);
      throw e;
    }
  }
  async function saveFuelLog(f: FuelLog) {
    return rentalAdminCall(() => jsonFetch('/api/fuel-logs', { method: 'POST', body: JSON.stringify(f) }));
  }
  async function deleteFuelLog(id: string) {
    return rentalAdminCall(() => jsonFetch(`/api/fuel-logs/${id}`, { method: 'DELETE' }));
  }
  async function saveRental(r: Rental) {
    return rentalAdminCall(() => jsonFetch('/api/rentals', { method: 'POST', body: JSON.stringify(r) }));
  }
  async function deleteRental(id: string) {
    return rentalAdminCall(() => jsonFetch(`/api/rentals/${id}`, { method: 'DELETE' }));
  }
  async function returnRental(id: string, info: { date: string; time: string; by: string; byId?: string }) {
    return withSync(() => jsonFetch(`/api/rentals/${id}/return`, { method: 'POST', body: JSON.stringify(info) }));
  }
  async function cancelReturnRental(id: string) {
    return withSync(() => jsonFetch(`/api/rentals/${id}/return`, { method: 'DELETE' }));
  }
  async function saveRentalTrip(t: RentalTrip) {
    return rentalAdminCall(() => jsonFetch('/api/rental-trips', { method: 'POST', body: JSON.stringify(t) }));
  }
  async function deleteRentalTrip(id: string) {
    return rentalAdminCall(() => jsonFetch(`/api/rental-trips/${id}`, { method: 'DELETE' }));
  }
  async function saveEmpIdRule(r: EmpIdRule & { assignMissing?: boolean }) {
    try {
      return await withSync(() => jsonFetch('/api/masters/emp-id-rule', { method: 'POST', body: JSON.stringify(r) }));
    } catch (e) {
      handleAdminApiError(e);
      throw e;
    }
  }
  async function clearLogs() {
    try {
      return await withSync(() => jsonFetch('/api/logs', { method: 'DELETE' }));
    } catch (e) {
      handleAdminApiError(e);
      throw e;
    }
  }

  async function handleAdminLogin(password: string) {
    try {
      await jsonFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      setIsAdmin(true);
      setShowAdminLogin(false);
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e?.message || 'ログインに失敗しました。' };
    }
  }

  async function handleAdminLogout() {
    try {
      await jsonFetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setIsAdmin(false);
  }

  // 入力操作は運転者としてログインしているときだけ行える。未ログインならログイン画面を開く。
  // after を渡すと、ログインできた後にその操作を続ける。
  function requireDriverLogin(after?: () => void): boolean {
    if (currentDriver) return true;
    afterDriverLoginRef.current = after ?? null;
    setDriverLoginNotice('出発登録・帰着登録・車両の予約・レンタカーの登録・給油の記録には、運転者としてのログインが必要です。');
    setShowDriverLogin(true);
    return false;
  }
  function openDriverLogin() {
    afterDriverLoginRef.current = null;
    setDriverLoginNotice(null);
    setShowDriverLogin(true);
  }
  function closeDriverLogin() {
    afterDriverLoginRef.current = null;
    setDriverLoginNotice(null);
    setShowDriverLogin(false);
  }

  function startQuickReport() {
    setTab('reports');
    setQuickReportTrigger(Date.now());
  }
  function handleQuickReport() {
    if (!requireDriverLogin(startQuickReport)) return;
    startQuickReport();
  }
  function handleQuickReportHandled() {
    setQuickReportTrigger(null);
  }

  function handleReturnCheckin(id: string) {
    const start = () => {
      setTab('reports');
      setReturnCheckinRequest({ id, token: Date.now() });
    };
    if (!requireDriverLogin(start)) return;
    start();
  }
  function handleReturnCheckinHandled() {
    setReturnCheckinRequest(null);
  }

  function handleSelectDriver(driver: Driver) {
    setCurrentDriverId(driver.id);
    setShowDriverLogin(false);
    setDriverLoginNotice(null);
    try {
      localStorage.setItem(DRIVER_SESSION_KEY, driver.id);
    } catch {
      // ignore
    }
    // ログインを求められた操作があれば、そのまま続ける（状態の更新はまとめて反映される）
    const next = afterDriverLoginRef.current;
    afterDriverLoginRef.current = null;
    next?.();
  }

  function handleSelectMechanic(name: string) {
    setMechanicName(name);
    setShowMechanicLogin(false);
    try {
      localStorage.setItem(MECHANIC_SESSION_KEY, name);
    } catch {
      // ignore
    }
  }
  function handleMechanicLogout() {
    setMechanicName(null);
    try {
      localStorage.removeItem(MECHANIC_SESSION_KEY);
    } catch {
      // ignore
    }
  }

  function handleDriverLogout() {
    setCurrentDriverId(null);
    try {
      localStorage.removeItem(DRIVER_SESSION_KEY);
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="main">
          <div className="empty-state">読み込み中…</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-shell">
        <div className="main">
          <div className="card">
            <div className="empty-state">{error || 'データがありません'}</div>
            <button className="btn btn-primary btn-block" onClick={load}>
              再読み込み
            </button>
          </div>
        </div>
      </div>
    );
  }

  // マスタから外された整備士のログインは無効にする
  const activeMechanic = mechanicName && data.masters.mechanics.includes(mechanicName) ? mechanicName : null;
  const currentDriver = data.drivers.find((d) => d.id === currentDriverId) || null;

  return (
    <div className="app-shell">
      <Header
        tab={tab}
        onTabChange={setTab}
        syncStatus={syncStatus}
        isAdmin={isAdmin}
        onOpenAdminLogin={() => setShowAdminLogin(true)}
        onLogoutAdmin={handleAdminLogout}
        onQuickReport={handleQuickReport}
        currentDriverName={currentDriver ? `${currentDriver.lastName} ${currentDriver.firstName}` : null}
        onOpenDriverLogin={openDriverLogin}
        onDriverLogout={handleDriverLogout}
        mechanicName={activeMechanic}
        onOpenMechanicLogin={() => setShowMechanicLogin(true)}
        onMechanicLogout={handleMechanicLogout}
      />

      <div className="statbar">
        <StatBar data={data} />
      </div>

      <main className="main">
        {tab === 'dashboard' && (
          <DashboardTab
            data={data}
            onReturnCheckin={handleReturnCheckin}
            onOpenMaintenance={() => setTab('maintenance')}
            currentDriver={currentDriver}
            onRequestDriverLogin={() => requireDriverLogin()}
            onSaveReservation={saveReservation}
            onDeleteReservation={deleteReservation}
          />
        )}
        {tab === 'reports' && (
          <ReportsTab
            data={data}
            onSave={saveReport}
            onDelete={deleteReport}
            openTrigger={quickReportTrigger}
            onQuickReportHandled={handleQuickReportHandled}
            returnCheckinRequest={returnCheckinRequest}
            onReturnCheckinHandled={handleReturnCheckinHandled}
            currentDriver={currentDriver}
            onRequestDriverLogin={() => requireDriverLogin()}
            isAdmin={isAdmin}
            onRequestLogin={() => setShowAdminLogin(true)}
          />
        )}
        {tab === 'maintenance' && <MaintenanceTab
            data={data}
            onSave={saveVehicle}
            onResolveRequest={resolveMaintRequest}
            mechanic={activeMechanic}
            canEdit={Boolean(activeMechanic) || isAdmin}
            onRequestMechanicLogin={() => setShowMechanicLogin(true)}
          />}
        {tab === 'fuel' && (
          <FuelTab
            data={data}
            currentDriver={currentDriver}
            onRequestDriverLogin={() => requireDriverLogin()}
            isAdmin={isAdmin}
            onRequestAdminLogin={() => setShowAdminLogin(true)}
            onSave={saveFuelLog}
            onDelete={deleteFuelLog}
          />
        )}
        {tab === 'rental' && (
          <RentalTab
            data={data}
            currentDriver={currentDriver}
            onRequestDriverLogin={() => requireDriverLogin()}
            onSave={saveRental}
            onReturn={returnRental}
            onCancelReturn={cancelReturnRental}
            isAdmin={isAdmin}
            onRequestAdminLogin={() => setShowAdminLogin(true)}
            onDelete={deleteRental}
            onSaveTrip={saveRentalTrip}
            onDeleteTrip={deleteRentalTrip}
          />
        )}
        {tab === 'help' && (
          <HelpTab
            onNavigate={(t) => {
              setTab(t);
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        {tab === 'admin' && (
          <AdminTab
            data={data}
            isAdmin={isAdmin}
            adminConfigured={adminConfigured}
            onSaveVehicle={saveVehicle}
            onDeleteVehicle={deleteVehicle}
            onBulkSaveVehicles={bulkSaveVehicles}
            onSaveDriver={saveDriver}
            onDeleteDriver={deleteDriver}
            onBulkSaveDrivers={bulkSaveDrivers}
            onSaveCategory={saveMasterCategory}
            onSaveAll={saveAllMasters}
            onSaveEmpIdRule={saveEmpIdRule}
            onRequestLogin={() => setShowAdminLogin(true)}
            onClearLogs={clearLogs}
          />
        )}
      </main>

      <div className="footer-note">
        社用車管理クラウド — Next.js / Vercel 上で稼働中
        {!data.persistent && '（Upstash Redis が未設定のため、再デプロイでデータが消える可能性があります）'}
      </div>

      {showMechanicLogin && (
        <MechanicLoginModal
          mechanics={data.masters.mechanics}
          notice="整備台帳の記録・修正・削除、整備依頼への対応には、整備士としてのログイン（または管理者ログイン）が必要です。"
          onClose={() => setShowMechanicLogin(false)}
          onSelect={handleSelectMechanic}
        />
      )}
      {showAdminLogin && <AdminLoginModal onClose={() => setShowAdminLogin(false)} onLogin={handleAdminLogin} />}
      {showDriverLogin && (
        <DriverLoginModal
          data={data}
          notice={driverLoginNotice}
          onClose={closeDriverLogin}
          onSelect={handleSelectDriver}
          onRegister={async (d) => {
            await saveDriver(d);
            handleSelectDriver(d);
          }}
        />
      )}
    </div>
  );
}
