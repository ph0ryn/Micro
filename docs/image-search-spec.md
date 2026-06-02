# 画像検索機能の予定仕様

## 状態

この文書は未実装機能の予定仕様を記録する。

`Image`、`loadImage()`、`Window.find()` は現在の公開 API に含まれない。
Apple Silicon と Node.js 24 で利用できる画像 matcher を選定した後に
実装する。

## 目的

ウィンドウ内の画像を検知し、一致した画像の左上座標をウィンドウ相対座標で
取得できるようにする。

画像ファイルは検索のたびに読み込まず、事前に一度だけ読み込んで再利用する。

## 予定 API

```ts
import { getWindow, loadImage, point } from "micro";

const chrome = await getWindow("Chrome");
const button = await loadImage("assets/button.png");
const topLeft = await chrome.find(button, 0.9);

await chrome.click(
  point(
    topLeft.x + button.center.x,
    topLeft.y + button.center.y,
  ),
  300,
);
```

```ts
type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

class Image {
  size: Size;
  center: Point;
}

loadImage(imagePath: string): Promise<Image>;

class Window {
  find(image: Image, confidence?: number): Promise<Point>;
}
```

## 挙動

- `loadImage()` は指定された画像ファイルを読み込み、再利用可能な `Image` を返す。
- `Image.size` は画像の幅と高さを返す。
- `Image.center` は画像内の中央座標を返す。端数は切り捨てる。
- `Window.find()` は対象ウィンドウ内だけを検索する。
- `Window.find()` は最初に一致した画像の左上座標を返す。
- 返却座標は対象ウィンドウ左上を原点とする相対座標とする。
- `confidence` は `0` から `1` の範囲で指定できる。
- `confidence` の既定値は `0.99` とする。
- 一致する画像がない場合は例外を返す。

## 初版では扱わない機能

- 複数一致結果の取得
- 画像を指定した直接クリック API
- matcher の自動インストール
- サブディスプレイ上のウィンドウ検索

## 既知の課題

`@nut-tree-fork/nut-js` 単体では画像 matcher provider が登録されないため、
`Window.find()` を実行すると `No ImageFinder registered` で失敗する。

fork 対応 matcher として `@udarrr/template-matcher` を確認したが、現在の
Apple Silicon と Node.js 24 の環境では OpenCV native library を読み込めない。

## 実装再開条件

- Apple Silicon と Node.js 24 で動作する画像 matcher を選定する。
- matcher の導入後に、メインディスプレイ上のウィンドウ内で画像検知の
  実機確認を行う。
- `loadImage()` が同じ画像データを再利用することをテストする。
- `Window.find()` が絶対座標をウィンドウ相対座標へ変換することをテストする。
