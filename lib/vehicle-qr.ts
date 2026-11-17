// 車両に貼るQRコードの中身：アプリのアドレスに、車両のidを付ける。読み取ると、その車両の画面が開く。
export const VEHICLE_QR_PARAM = 'vehicle';
export const vehicleLandingUrl = (origin: string, vehicleId: string) => `${origin.replace(/\/$/, '')}/?${VEHICLE_QR_PARAM}=${encodeURIComponent(vehicleId)}`;
// 車両を選んだ状態で「事故・故障」の画面を開くためのイベント
export const OPEN_INCIDENT_EVENT = 'fleet:open-incident';
