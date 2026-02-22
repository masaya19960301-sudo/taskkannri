# Cloud移行戦略 (Cloud Run / Firebase)

## 移行アーキテクチャ

```
現在: GAS + Spreadsheet
  ↓
Phase 1: Cloud Run + Firestore (バックエンド移行)
  ↓
Phase 2: Firebase Hosting + Cloud Run API (フロントエンド移行)
  ↓
Phase 3: Cloud Functions + Pub/Sub (非同期処理移行)
```

## Firestore スキーマ設計

### コレクション構造

```
/users/{userId}
  - email: string
  - displayName: string
  - department: string
  - role: "admin" | "user"
  - createdAt: timestamp
  - updatedAt: timestamp

/tasks/{taskId}
  - title: string
  - description: string
  - dueDate: string (YYYY-MM-DD)
  - dueTime: string (HH:MM)
  - priority: number (1-3)
  - status: "未着手" | "進行中" | "完了"
  - assigneeId: string (ref: users)
  - categoryId: string (ref: categories)
  - recurrenceId: string (ref: recurrences)
  - externalUUID: string
  - invoiceNo: string
  - sortOrder: number
  - calendarEventId: string
  - createdAt: timestamp
  - updatedAt: timestamp
  - createdBy: string (ref: users)
  - updatedBy: string (ref: users)

/tasks/{taskId}/attachments/{attachmentId}
  - driveFileId: string → Storage URL に移行
  - fileName: string
  - mimeType: string
  - size: number
  - uploadedBy: string
  - createdAt: timestamp

/tasks/{taskId}/logs/{logId}
  - actionType: string
  - userId: string
  - detail: string
  - timestamp: timestamp

/recurrences/{recurrenceId}
  - type: string
  - interval: number
  - weekdays: array<number>
  - baseDate: string

/externalLinks/{linkId}
  - taskId: string
  - invoiceNo: string
  - externalUUID: string
  - sourceSheetId: string
  - sourceRowId: string
  - syncUpdatedAt: timestamp

/categories/{categoryId}
  - name: string
  - color: string
  - sortOrder: number
  - createdAt: timestamp
```

### Firestore インデックス

```
// 複合インデックス
tasks: status ASC, dueDate ASC, priority DESC, sortOrder ASC
tasks: assigneeId ASC, status ASC, dueDate ASC
tasks: categoryId ASC, status ASC
tasks: status ASC, updatedAt ASC  (TTL用)
```

## Phase 1: バックエンド移行 (Cloud Run + Firestore)

### Repository層の差し替え

現在の `BaseRepository` を `FirestoreBaseRepository` に置換するだけで移行可能。
Service層・API層は変更不要。

```javascript
// FirestoreBaseRepository.js
class FirestoreBaseRepository {
  constructor(collectionName, primaryKey) {
    this._collection = collectionName;
    this._primaryKey = primaryKey;
    this._db = admin.firestore();
  }

  async findById(id) {
    const doc = await this._db.collection(this._collection).doc(id).get();
    return doc.exists ? { ...doc.data(), [this._primaryKey]: doc.id } : null;
  }

  async findAll() {
    const snapshot = await this._db.collection(this._collection).get();
    return snapshot.docs.map(doc => ({ ...doc.data(), [this._primaryKey]: doc.id }));
  }

  async findByConditions(conditions) {
    let query = this._db.collection(this._collection);
    Object.entries(conditions).forEach(([field, value]) => {
      if (Array.isArray(value)) {
        query = query.where(field, 'in', value);
      } else {
        query = query.where(field, '==', value);
      }
    });
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ ...doc.data(), [this._primaryKey]: doc.id }));
  }

  async create(entity) {
    const id = entity[this._primaryKey];
    await this._db.collection(this._collection).doc(id).set(entity);
    return entity;
  }

  async update(id, entity) {
    await this._db.collection(this._collection).doc(id).update(entity);
    return entity;
  }

  async delete(id) {
    await this._db.collection(this._collection).doc(id).delete();
    return true;
  }

  async createBatch(entities) {
    const batch = this._db.batch();
    entities.forEach(entity => {
      const ref = this._db.collection(this._collection).doc(entity[this._primaryKey]);
      batch.set(ref, entity);
    });
    await batch.commit();
    return entities;
  }
}
```

### Cloud Run 構成

```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/taskkanri-api', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/taskkanri-api']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'taskkanri-api'
      - '--image=gcr.io/$PROJECT_ID/taskkanri-api'
      - '--region=asia-northeast1'
      - '--platform=managed'
      - '--allow-unauthenticated=false'
```

### Express.js API サーバー

```javascript
// server.js
const express = require('express');
const app = express();

// 既存の Router.js のルーティングロジックをそのまま移植
app.use('/api', apiRouter);

// 認証ミドルウェア (Firebase Auth)
app.use('/api', async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  const decoded = await admin.auth().verifyIdToken(token);
  req.user = await userService.findByEmail(decoded.email);
  next();
});
```

## Phase 2: フロントエンド移行 (Firebase Hosting)

- 現在の Vanilla JS SPA はそのまま利用可能
- `google.script.run` → `fetch('/api/...')` に置換
- Firebase Hosting で静的ファイルを配信
- Firebase Auth でGoogleログイン

### ApiClient の差し替え

```javascript
// ApiClient.js (Firebase版)
const ApiClient = {
  async request(method, path, params) {
    const token = await firebase.auth().currentUser.getIdToken();
    const response = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-CSRF-Token': this._csrfToken,
      },
      body: method !== 'GET' ? JSON.stringify(params) : undefined,
    });
    return response.json();
  },
};
```

## Phase 3: 非同期処理移行 (Cloud Functions)

| GAS トリガー | 移行先 |
|---|---|
| `triggerProcessRecurrences` | Cloud Scheduler → Pub/Sub → Cloud Functions |
| `triggerDailySync` | Cloud Scheduler → Cloud Functions |
| `triggerMonthlyCleanup` | Firestore TTL ポリシー + Cloud Functions |
| `triggerRebuildIndex` | 不要 (Firestore ネイティブインデックス) |

### 添付ファイル

- Google Drive → Cloud Storage に移行
- Firebase Storage でクライアントから直接アップロード
- Cloud Functions で後処理（リサイズ、ウイルススキャン等）

### カレンダー連携

- Google Calendar API は Cloud Run からも利用可能
- サービスアカウントまたはユーザーの OAuth トークンを使用

## データ移行手順

1. GAS でエクスポートスクリプトを実行（全データをJSON出力）
2. Cloud Functions のインポートスクリプトで Firestore に投入
3. 添付ファイルを Drive → Cloud Storage にコピー
4. DNS切り替え（Firebase Hosting のカスタムドメイン）
5. GAS のトリガーを無効化

## 移行時の注意点

- Firestore の書き込みコスト（バッチ処理で最適化）
- Firestore の 1MB ドキュメントサイズ制限
- Cloud Run のコールドスタート対策（min-instances=1）
- CORS 設定（Firebase Hosting + Cloud Run）
- 既存ユーザーの認証移行（Google OAuth は共通）
