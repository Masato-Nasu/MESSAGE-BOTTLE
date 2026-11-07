# MESSAGE BOTTLE

[アプリを開く](https://message-bottle.1bitexist.workers.dev/) · [MASATO LAB](https://masato-lab.pages.dev/tools-other)

ネットの海に、ボトルを流す。iPhoneのSafari、Android、PCから使えるWebアプリです。手紙を書き、３分後・１日後・１週間後・１カ月後・１年後・５年後・10年後・潮まかせから選びます。手紙は最大3,000文字。長い手紙には具体的な内容を拾った長めの返事が届きます。投函時は入力した手紙が瓶に入って流れる約12秒のアニメーションが再生されます。

## 試用版

`dist/` を静的サイトとして配信すると、投函画面と固定の返信見本を試せます。ここではAI検索とLINE送信を行いません。

```sh
python3 -m http.server 8000 --directory dist
```

## LINE配信版

Cloudflare WorkersとD1、Messaging APIが有効なLINE公式アカウントを用意します。投函する人はウェブ検索を利用できる自身のOpenAI APIキーを入力します。新しいWorker名とD1を使うため、既存のアプリを置き換える必要はありません。

1. Cloudflareにログインし、D1を作ります。

   ```sh
   npx wrangler login
   npx wrangler d1 create message-bottle
   ```

2. `wrangler.toml` の `database_id` を作成結果のIDに、`LINE_OFFICIAL_ID` を公式アカウントの基本ID（例 `@abc123de`）に差し替えます。必要なら `OPENAI_MODEL` をウェブ検索対応モデルへ変更します。
3. D1のマイグレーションと初回デプロイを実行し、秘密情報をWorkerに設定します。

   ```sh
   npx wrangler d1 migrations apply message-bottle --remote
   npx wrangler deploy
   npx wrangler secret put LINE_CHANNEL_SECRET
   npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
   openssl rand -hex 32 | tr -d '\n' | npx wrangler secret put BOTTLE_KEY_ENCRYPTION_SECRET
   ```

4. LINE DevelopersのMessaging API設定でWebhook URLを `https://<Workerのホスト名>/api/line/webhook` に設定し、検証してWebhookを有効にします。公式アカウントの自動応答を使っている場合は、連携コードへの定型応答をオフにすると自然です。
5. iPhoneのSafariでWorkerのURLを開き、手紙を書いて「海に流す」を押します。初回は「LINEで連携コードを送る」を押し、公式アカウントを友だち追加してコードを送信します。元のSafariタブに戻り、OpenAI APIキーを入力して投函します。最初は３分後を選んで配信を確認します。

### 初回連携をLINEログインにする

1. LINE Developersで、既存のMESSAGE BOTTLEのMessaging APIチャネルと同じプロバイダーに、MESSAGE BOTTLE用のLINEログインチャネルを作成します。アプリタイプはウェブアプリを選びます。
2. LINEログインチャネルの「チャネル基本設定」で、リンクされたLINE公式アカウントにMESSAGE BOTTLEを指定します。「LINEログイン設定」のコールバックURLに `https://<Workerのホスト名>/api/line/login/callback` を設定します。
3. Workerをデプロイし、LINEログインチャネルのIDとシークレットを登録します。Messaging API側のチャネルとは別の値です。

   ```sh
   npx wrangler secret put LINE_LOGIN_CHANNEL_ID
   npx wrangler secret put LINE_LOGIN_CHANNEL_SECRET
   ```

4. 開発中のチャネルでは管理者またはテスターで、まだ連携していないブラウザを使って動作を確認します。ほかの利用者にも提供するときはLINEログインチャネルを公開します。LINEログインの設定が両方そろうと、新規利用者は投函ボタンからLINEの許可画面へ進みます。ブラウザに戻ると下書きを復元し、OpenAI APIキーの入力後に投函できます。既に連携したブラウザはそのまま使えます。

[LINEログインの公式手順](https://developers.line.biz/ja/docs/line-login/integrate-line-login/) · [公式アカウントとのリンク](https://developers.line.biz/ja/docs/line-login/link-a-bot/)

### 既存WorkerをBYOK版へ更新する

`worker.mjs`、`bottle-keys.mjs`、`migrations/0002_bottle_api_key.sql`、`dist/app.js`、`dist/index.html`、`dist/style.css` を差し替え、マイグレーションを適用してデプロイします。既存の設定ファイルは引き継ぎます。暗号化用シークレットは初回のみ生成し、暗号化済みの投函が残っている間は同じ値を維持します。

```sh
openssl rand -hex 32 | tr -d '\n' | npx wrangler secret put BOTTLE_KEY_ENCRYPTION_SECRET
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

新しい投函では、入力したAPIキーを返信生成までD1に暗号化して保管します。下書きやブラウザストレージにはキーを保存しません。返信の生成完了時、または配信処理が失敗で終了したときに、稼働中のD1の該当レコードからキーを削除します。予約日にキーが失効している場合は返信を生成できません。既存の `OPENAI_API_KEY` はBYOK切り替え前の予約だけで使われます。

### 配信のしくみ

- サーバーが投函と配信予定をD1へ保存し、毎分のCronで期限を迎えた手紙を処理します。予定時刻は処理開始の目安です。
- 月・年単位は日本時間の同時刻を使い、同じ日付が存在しなければ月末に合わせます。「潮まかせ」は７つの期間から等確率で選びます。
- 配信時にAIがウェブ検索を行い、検索の出典からURLを１件採用します。LINEには架空の拾い主からの返信、URL、差出人の原文が通常のメッセージで届きます。
- 手紙はD1に保存され、返信を作る際にOpenAIへ送られます。LINEへは手紙と生成した返信が送られます。配信には各サービスの利用枠が適用されます。長期投函を維持するには、Worker、D1、アカウントと認証情報を継続管理してください。
- LINEの再送キーで重複送信を抑えます。運用上の配信失敗はD1の `bottles.state = 'failed'` で確認できます。`sent` はLINE APIによる受理を示します。

参考資料

- [LINE Messaging APIのメッセージ送信](https://developers.line.biz/ja/docs/messaging-api/sending-messages/)
- [LINE Webhookの署名検証](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [Cloudflare WorkersのCron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [OpenAI APIのWeb検索](https://developers.openai.com/api/docs/guides/tools-web-search)
