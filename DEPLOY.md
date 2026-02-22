# TaskKanri デプロイ手順

## 前提条件

- Google Workspace アカウント
- Node.js 18+ (clasp 用)
- `@google/clasp` CLI インストール済み

## 1. clasp セットアップ

```bash
npm install -g @google/clasp
clasp login
```

## 2. GAS プロジェクト作成

```bash
# 既存スプレッドシートにバインドする場合
clasp create --type sheets --title "TaskKanri" --rootDir src

# スタンドアロンスクリプトの場合
clasp create --type webapp --title "TaskKanri" --rootDir src
```

生成された `.clasp.json` の `scriptId` を確認。

## 3. コードのプッシュ

```bash
clasp push
```

`.claspignore` が自動生成される。`test/` ディレクトリもプッシュすることで
GAS エディタ上でテスト実行可能。

## 4. スプレッドシート初期化

GAS エディタで以下を実行:

```
setupSpreadsheet()
```

全シート（Users, Tasks, Recurrences, ExternalLinks, Attachments, Logs, Categories, _Index）が
ヘッダー付きで作成される。

## 5. トリガー設定

GAS エディタで以下を実行:

```
setupAllTriggers()
```

設定されるトリガー:
| トリガー | スケジュール | 処理内容 |
|---|---|---|
| `triggerProcessRecurrences` | 毎時 | 繰り返しタスク生成 |
| `triggerDailySync` | 毎日 6:00 | 外部シート日次同期 |
| `triggerMonthlyCleanup` | 毎月1日 3:00 | 古いログ・タスク削除 |
| `triggerRebuildIndex` | 毎日 2:00 | インデックス再構築 |

## 6. Web アプリとしてデプロイ

```bash
clasp deploy --description "v1.0.0"
```

または GAS エディタ > デプロイ > 新しいデプロイ:
- 種類: ウェブアプリ
- 実行するユーザー: ウェブアプリにアクセスしているユーザー
- アクセスできるユーザー: 組織内のユーザー（Google Workspace）

## 7. テスト実行

GAS エディタで以下の関数を実行:

```
// ユニットテスト
runAllTests()

// テストデータ生成（100件）
generateTestData(100)

// パフォーマンステスト（5000件）
runPerformanceTest()

// 同時更新テスト
runConcurrencyTest()

// テストデータ削除
clearTestData()
```

## 8. 初期管理者設定

最初にアクセスしたユーザーは `user` ロールで登録される。
管理者にするにはスプレッドシートの Users シートで直接 `role` を `admin` に変更する。

## トラブルシューティング

### スプレッドシートが見つからないエラー
- スクリプトがスプレッドシートにバインドされているか確認
- スタンドアロンの場合、`SpreadsheetApp.openById()` にIDを渡す必要がある

### 権限エラー
- OAuth スコープの承認を実行（初回実行時に自動表示）
- `appsscript.json` の `oauthScopes` を確認

### ロックタイムアウト
- 同時アクセスが集中している場合に発生
- デフォルトのタイムアウト（10秒）を延長する場合は `LockManager` の `waitMs` を調整
