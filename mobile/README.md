# 社用車管理 モバイルアプリ（iOS / Android）

React Native（Expo）で作った、社用車管理アプリのスマホ版です。Web版（Next.js）の `/api` をそのまま使うので、データはWeb版と共通です。型・燃費計算・アラート条件も `../lib` を共有しています。

## いまできること（第1段階）
- ダッシュボード（運転中の車両、帰着未登録、整備依頼、車検・オイル・免許・アルコールのアラート）
- 運転日報：出発登録、帰着登録（整備依頼つき）
- 給油台帳：記録、車両ごとの絞り込み、燃費・費用の集計
- 運転者ログイン（名前を選ぶだけ）

## まだできないこと（Web版で行います）
予約、レンタカー、整備台帳、管理画面（記録の修正・削除、マスタ）、メーターの写真読み取り、整備士ログイン。

## 動かし方（開発用）
パソコンに Node.js が必要です。

```bash
cd mobile
npm install
npx expo install react react-native react-native-safe-area-context @react-native-async-storage/async-storage expo-secure-store expo-status-bar
npm i -D @types/react
npx expo install --fix   # Expo のバージョンに合う依存へそろえる
npx expo start
```

表示されたQRコードを、スマホの **Expo Go** アプリで読み取ると起動します。初回は、Web版のURL（例：`https://xxxx.vercel.app`）を入力します。Web版でBasic認証を設定している場合だけ、ユーザー名とパスワードも入力してください（端末の安全な領域に保存されます）。

## 注意
- この第1段階の画面は、Expo Go での実機確認がまだです。通信・入力チェック・保存の処理は、本物のAPIに対する自動テストで確認しています。
- ストアでの公開には、`app.json` に bundle identifier / package の設定、EAS Build、Apple Developer / Google Play の登録が必要です。配布方法は未定です。
