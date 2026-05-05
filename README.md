# Runtime Atlas Survivor

Canvas2Dで描いたドット絵を起動時にWebGLテクスチャへ詰める、ヴァンサバライクのブラウザゲーム試作です。

## Features

- Canvas2Dでドット絵スプライトをコード生成
- 起動時にランタイムテクスチャアトラスを構築
- WebGL 1.0でアトラスを参照してスプライトをバッチ描画
- WASD / 矢印キー移動
- 自動射撃、敵スポーン、経験値ジェム、レベルアップ
- 右下の `runtime atlas` で生成済みアトラスを確認可能

## Run

```bash
npm install
npm run dev
```

ブラウザでViteのローカルURLを開いてください。

## Structure

```text
index.html        # Canvas mount point
src/main.js       # Runtime atlas, WebGL renderer, game loop
src/styles.css    # Fullscreen canvas and HUD styles
```

## Next Ideas

- 武器をデータ駆動にする
- スプライト生成関数を別ファイル化する
- 空間分割グリッドで当たり判定を高速化する
- WebGL2 instancingまたはstatic VBO化で描画負荷を下げる
- GitHub Pagesへのデプロイワークフローを追加する
