export type MaintProgress = 'pending' | 'watch' | 'done';
export const MAINT_PROGRESS: { key: MaintProgress; label: string; pill: string }[] = [
  { key: 'pending', label: '整備中', pill: 'pill-red' },
  { key: 'watch', label: '👀 経過観察', pill: 'pill-sky' },
  { key: 'done', label: '✓ 完了', pill: 'pill-green' },
];

export type MaintRecord = {
  date: string;
  type: string; // 整備種別。複数選んだときは「、」でつないだ文字列（一覧・検索・CSV はこれを使う）
  types?: string[]; // 選んだ整備種別（複数可）。無い記録は type ひとつだけ
  km: number;
  note: string;
  // 整備台帳で記録する任意項目（既存データには無いので optional）
  cost?: number;
  shop?: string;
  by?: string; // 整備士としてログインして記録した人
  request?: string; // 依頼内容（整備依頼への対応として記録したとき、依頼の症状・内容）
  work?: string; // 整備内容（実際に行った整備、交換した部品など）
  nextOilKm?: number; // オイル交換のとき、次回交換の走行距離（km）。保存すると車両台帳の oilKm に反映する
  requestId?: string; // 整備依頼への対応として記録したとき、その依頼（日報）のid。進捗は依頼の状態と連動する
  progress?: MaintProgress; // 進捗。無いときは完了として扱う（以前の記録）
  photos?: string[]; // 添付した写真のid（最大3枚。本体は /api/photos/{id}）
  progressLog?: { at: string; progress: MaintProgress; by?: string }[]; // 進捗が変わるたびに残す経過（整備中→完了など）
};

export type Report = {
  id: string;
  date: string;
  dept: string;
  driverId?: string;
  driverLast: string;
  driverFirst: string;
  driver: string;
  vehicleId: string;
  vehicleName: string;
  plate: string;
  destination: string;
  purpose: string;
  preTime: string;
  preAlcohol: string;
  preChecker: string;
  preMethod?: string;
  alcoholSkipped?: boolean;
  tireOk: boolean;
  brakeOk: boolean;
  postDone: boolean;
  postTime: string;
  postAlcohol: string;
  postChecker: string;
  postMethod?: string;
  startKm: number;
  endKm: number;
  tripKm: number;
  notes: string;
  inspectionPhoto?: string;
  // 帰着登録時の整備依頼（既存の日報には無いので optional）
  maintRequest?: boolean;
  maintRequestType?: string;
  maintRequestUrgency?: string;
  maintRequestNote?: string;
  maintRequestPhotos?: string[]; // 依頼に添付した写真のid（最大3枚）
  // 整備台帳で対応を記録すると true（対応待ち → 対応済）
  maintRequestDone?: boolean;
  maintRequestDoneAt?: string;
  maintRequestScheduledDate?: string; // 修理予定日（YYYY-MM-DD）。整備士・管理者が決めると、お知らせと通知が出る
  // 経過観察中（依頼は残したまま、様子を見ている状態）
  maintRequestWatch?: boolean;
  maintRequestWatchAt?: string;
  // ダッシュボードから直接出した整備依頼（運転の記録ではない）。日報の一覧・集計・CSVには出さない
  maintOnly?: boolean;
};

export const MAINT_URGENCIES = ['通常', '早めに', '至急（使用不可）'] as const;

// タイヤ1セット分の情報。size はタイヤサイズ（例 195/65R15 91H）。dot はタイヤ側面の DOT の最後の4桁（週2桁＋年2桁。例 2324 = 2024年の23週）。
// year は（旧）製造年（2024 か 2024-05 の形）。DOT を入れていないものだけ、表示に使う
export type TireInfo = { maker?: string; size?: string; dot?: string; year?: string };

export type Vehicle = {
  id: string;
  name: string;
  plate: string;
  modelType: string;
  shakenDate: string;
  checkDate: string;
  odometer: number;
  oilKm: number;
  tire: string;
  tireSummer?: TireInfo; // 夏タイヤのメーカー・製造年
  tireWinter?: TireInfo; // 冬タイヤ（スタッドレス）のメーカー・製造年
  tireMaker?: string; // （旧）タイヤのメーカー。夏・冬に分ける前の項目。tireSetsOf で読む
  tireYear?: string; // （旧）タイヤの製造年
  maintHistory: MaintRecord[];
  // 車検証から入れる任意の項目（既存の車両には無いので optional）
  maker?: string; // 車名（トヨタ など）
  chassisNo?: string; // 車台番号
  firstRegistered?: string; // 初度登録年月 YYYY-MM
  capacity?: string; // 乗車定員 例: 5人
  grossWeight?: string; // 車両総重量 例: 2,610kg
  displacement?: string; // 総排気量 例: 2.76L
  fuelType?: string; // 燃料の種類
  recordFileAt?: string; // 検査証記録事項の画像を保存した日時（ISO）。あるときだけ「記録事項を見る」を出す
  shakenFileAt?: string; // 車検証の画像を保存した日時（ISO）。あるときだけ「車検証を見る」を出す
};

export type Driver = {
  id: string;
  lastName: string;
  firstName: string;
  empId: string;
  dept: string;
  licenseType: string;
  licenseExpiry: string;
  phone: string;
  licenseNo: string;
  notes: string;
};

export const MASTER_KEYS = [
  'departments',
  'checkers',
  'checkMethods',
  'maintTypes',
  'tireTypes',
  'licenseTypes',
  'rentalCompanies',
  'rentalCarClasses',
  'mechanics',
  'fuelTypes',
  'payMethods',
] as const;
export type MasterKey = (typeof MASTER_KEYS)[number];
export type Masters = Record<MasterKey, string[]>;

export const MASTER_LABELS: Record<MasterKey, string> = {
  departments: '事業部・部署',
  checkers: '確認者（安全運転管理者等）',
  checkMethods: '確認方法',
  maintTypes: '整備種別',
  tireTypes: 'タイヤ種別',
  licenseTypes: '免許種別',
  rentalCompanies: 'レンタカー会社',
  rentalCarClasses: 'レンタカー車種クラス',
  mechanics: '整備士（整備台帳にログインできる人）',
  fuelTypes: '燃料種別',
  payMethods: '給油の支払方法',
};

export type LogEntry = {
  id: string;
  at: string;
  actor: 'admin' | 'user';
  action: string;
  target: string;
  detail?: string;
};

// 車両の予約（使用予定）。日報とは別に、事前に押さえる使用枠を持つ。
export type Reservation = {
  id: string;
  vehicleId: string; // レンタカーの予約のときは、そのレンタカーのid（rentalId と同じ）
  rentalId?: string; // レンタカーの予約のとき設定。予約できるのはレンタカーの登録期間のみ
  vehicleName: string;
  plate: string;
  driverId?: string;
  driver: string;
  driverLast: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD（1日だけの予約は startDate と同じ）
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  destination: string;
  purpose: string;
  note: string;
  createdAt: string;
};

// レンタカーの利用記録（車両台帳とは別管理）
export type Rental = {
  id: string;
  company: string; // レンタカー会社
  carClass: string; // 車種クラス
  carModel: string; // 車種（例: ヤリス）
  plate: string; // 借りた車のナンバー
  reservationNo: string; // 予約番号（レンタカー会社の控え）
  driverId?: string; // 登録した人
  driver: string;
  dept: string;
  startDate: string;
  endDate: string;
  cost: number; // 料金（円）
  notes: string;
  returnedAt?: string; // 実際に返却した日。未設定なら利用中
  returnedTime?: string; // 返却した時刻 HH:MM
  returnedBy?: string; // 返却した人
  returnedById?: string; // 返却者が運転者台帳の人のとき
  createdAt: string;
};

// レンタカーの運行記録（いつ・誰が運転したか）。レンタカー登録とは別に管理する。
export type RentalTrip = {
  id: string;
  rentalId: string;
  date: string; // 運転した日
  driverId?: string; // 運転者台帳の人。台帳外の人は未設定
  driver: string;
  dept?: string; // 事業部
  site?: string; // 現場名
  note: string; // 区間・用件など（任意）
  createdAt: string;
};

// 給油台帳の1件
export type FuelLog = {
  id: string;
  date: string; // 給油日
  vehicleId: string;
  vehicleName: string; // 記録時点の呼称（車両を台帳から消しても残す）
  plate: string;
  fuelType: string;
  liters: number; // 給油量（L）
  amount: number; // 金額（円）
  km: number; // 給油時のメーター（km）
  full: boolean; // 満タン給油か（燃費の計算に使う）
  payMethod: string;
  driverId?: string;
  driver: string; // 給油した人
  note: string;
  createdAt: string;
};

export type EmpIdRule = {
  prefix: string; // 例: EMP-
  digits: number; // 数字部分の桁数（ゼロ埋め）
  next: number; // 次に振る番号
};
export const DEFAULT_EMP_ID_RULE: EmpIdRule = { prefix: 'EMP-', digits: 3, next: 1 };

export type AppData = {
  reports: Report[];
  empIdRule: EmpIdRule;
  reservations: Reservation[];
  rentals: Rental[];
  rentalTrips: RentalTrip[];
  fuelLogs: FuelLog[];
  vehicles: Vehicle[];
  drivers: Driver[];
  masters: Masters;
  logs: LogEntry[];
  persistent: boolean;
  alertSettings?: import('./alert-settings').AlertSettings; // アラートを出す時期（/api/data が付ける。無ければ初期値）
};

export const DEFAULT_MASTERS: Masters = {
  departments: ['営業第1部', '営業第2部', '物流管理課', '総務管理課', 'その他'],
  checkers: ['安全運転管理者 田中', '副安全運転管理者 佐藤', '総務担当 鈴木', '所属長・代行者'],
  checkMethods: ['対面', '電話・通話', 'ビデオ通話', '直行直帰（遠隔指示）'],
  maintTypes: ['オイル交換', '車検完了', '12ヶ月点検', 'タイヤ交換', '修理・洗車', 'その他'],
  tireTypes: ['夏タイヤ（ノーマル）', 'スタッドレス（冬用）', 'オールシーズン'],
  licenseTypes: ['普通第一種', '準中型（5t限定含む）', '中型（8t限定含む）', '大型第一種', '第二種免許'],
  rentalCompanies: ['トヨタレンタカー', 'ニッポンレンタカー', 'オリックスレンタカー', 'タイムズカー', 'その他'],
  rentalCarClasses: ['軽自動車', 'コンパクト', 'セダン', 'ミニバン・ワゴン', 'SUV', 'トラック・バン', 'その他'],
  mechanics: ['整備士 山本', '整備士 中村'],
  fuelTypes: ['レギュラー', 'ハイオク', '軽油', 'その他'],
  payMethods: ['給油カード', '現金（立替）', 'クレジットカード', 'その他'],
};

export const DEFAULT_VEHICLES: Vehicle[] = [
  {
    id: 'v1',
    name: '車両1号（プリウス 白）',
    plate: '品川 500 さ 12-34',
    modelType: '6AA-ZVW51',
    shakenDate: '2026-10-15',
    checkDate: '2026-11-20',
    odometer: 35245,
    oilKm: 38000,
    tire: '夏タイヤ（ノーマル）',
    maintHistory: [],
  },
  {
    id: 'v2',
    name: '車両2号（プロボックス 銀）',
    plate: '品川 400 た 56-78',
    modelType: '3BD-NCP160V',
    shakenDate: '2027-03-25',
    checkDate: '2026-12-10',
    odometer: 78120,
    oilKm: 79500,
    tire: '夏タイヤ（ノーマル）',
    maintHistory: [],
  },
  {
    id: 'v3',
    name: '車両3号（ハイエース 白）',
    plate: '品川 400 す 99-01',
    modelType: '3DF-GDH201V',
    shakenDate: '2027-01-20',
    checkDate: '2027-01-20',
    odometer: 54300,
    oilKm: 56000,
    tire: '夏タイヤ（ノーマル）',
    maintHistory: [],
  },
];

export const DEFAULT_DRIVERS: Driver[] = [
  {
    id: 'd1',
    lastName: '山田',
    firstName: '太郎',
    empId: 'EMP-001',
    dept: '営業第1部',
    licenseType: '普通第一種',
    licenseExpiry: '2026-10-25',
    phone: '090-1234-5678',
    licenseNo: '第301234567890号',
    notes: 'ゴールド免許',
  },
  {
    id: 'd2',
    lastName: '佐藤',
    firstName: '次郎',
    empId: 'EMP-005',
    dept: '物流管理課',
    licenseType: '準中型（5t限定含む）',
    licenseExpiry: '2027-05-18',
    phone: '090-8765-4321',
    licenseNo: '第301987654321号',
    notes: 'リーダー',
  },
];

// ガソリンカード・ETCカードの借用（貸出）。日報などの本体データとは別のキー（lib/cards-store.ts）に保存する。
export type CardKind = 'gas' | 'etc';
export const CARD_KINDS: { key: CardKind; label: string; icon: string }[] = [
  { key: 'gas', label: 'ガソリンカード', icon: '⛽' },
  { key: 'etc', label: 'ETCカード', icon: '🛣️' },
];

export type FleetCard = {
  id: string;
  kind: CardKind; // 主な種類（kinds の先頭。以前のデータとの互換用）
  kinds?: CardKind[]; // 種類（複数にチェックできる。例：ガソリンとETCの兼用カード）。無い古いデータは [kind] として扱う
  name: string; // 管理名（例：ガソリンカード1・ETC 3号車用）
  dept?: string; // 事業部（このカードを管理・使う事業部。空なら指定なし）
  number?: string; // 識別用の番号（下4桁など。カード番号の全桁は入れない）
  note?: string;
};

export type CardLoan = {
  id: string;
  cardId: string;
  borrowerId: string;
  borrower: string;
  dept?: string;
  borrowedAt: string; // ISO日時
  dueDate?: string; // 返却予定日 YYYY-MM-DD
  purpose?: string; // 用途・行先
  vehicleId?: string;
  vehicleName?: string;
  returnedAt?: string; // ISO日時（あれば返却済）
  returnedBy?: string;
  note?: string;
};

export const cardKinds = (c: Pick<FleetCard, 'kind' | 'kinds'>): CardKind[] => (c.kinds && c.kinds.length > 0 ? c.kinds : [c.kind]);
export const cardKindLabel = (c: Pick<FleetCard, 'kind' | 'kinds'>): string =>
  cardKinds(c)
    .map((k) => CARD_KINDS.find((x) => x.key === k)?.label || k)
    .join('・');
export const cardKindIcon = (c: Pick<FleetCard, 'kind' | 'kinds'>): string =>
  cardKinds(c)
    .map((k) => CARD_KINDS.find((x) => x.key === k)?.icon || '')
    .join('');
