const inputDirectory = '/tmp/input_images'; // 入力画像があるディレクトリ
const outputFileName = '/tmp/output_image.jpg'; // 出力ファイル名
const n = 5;

module.exports = async (req, res) => {
  const { domain } = req.query;
  
  try {
    await main(domain);
    const check = fs.existsSync(outputFileName);
    
    if (check) {
      // 適切なヘッダーを設定
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=60'); // 1minキャッシュ
      
      // 画像ファイルを送信
      // 画像ファイルを読み込む
      fs.readFile(outputFileName, (err, data) => {
        if (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Error reading image file');
          return;
        }
    
        res.statusCode = 200;
        // バイナリデータをレスポンスとして送信
        res.end(data);
      });
    } else {
      res.status(500).send(`画像の生成に失敗しました。domain: ${domain}`);
    }
  } catch (error) {
    console.error('処理エラー:', error);
    res.status(500).send(`エラーが発生しました: ${error.message}`);
  }
}

// Generated with Gemini (Modified)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * 指定されたディレクトリ内のn^2枚のJPG画像をタイル状に並べて1つのJPG画像に結合します。
 *
 * @param {string} inputDir - 入力JPG画像が保存されているディレクトリのパス。
 * @param {string} outputPath - 出力される結合済みJPG画像のパスとファイル名。
 * @param {number} n - タイル状に並べる際のグリッドの辺の長さ（例: n=3の場合、3x3のグリッド）。
 * @returns {Promise<void>} 結合処理が完了したときに解決されるPromise。
 */
async function combineJpgImages(inputDir, outputPath, n) {
    if (n <= 0) {
        throw new Error("nは正の整数である必要があります。");
    }

    // ディレクトリ内のJPGファイルを取得
    const files = fs.readdirSync(inputDir)
                    .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg'))
                    .map(file => path.join(inputDir, file))
                    .sort(); // ファイル名でソート

    if (files.length !== n * n) {
        throw new Error(`入力ディレクトリにはn^2 (${n * n}) 枚のJPG画像が必要です。現在 ${files.length} 枚の画像があります。`);
    }

    // 最初の画像のサイズを取得
    const firstImage = sharp(files[0]);
    const metadata = await firstImage.metadata();
    const imageWidth = metadata.width;
    const imageHeight = metadata.height;

    if (!imageWidth || !imageHeight) {
        throw new Error("最初の画像の幅または高さを取得できませんでした。");
    }

    // 出力画像の全体の幅と高さを計算
    const outputWidth = imageWidth * n;
    const outputHeight = imageHeight * n;

    // 各画像を配置するための配列を作成
    const imagesToComposite = [];

    for (let i = n - 1; 0 <= i; i--) { // 行
        for (let j = n - 1; 0 <= j; j--) { // 列
            const index = i * n + j;
            if (files[index]) {
                imagesToComposite.push({
                    input: files[index],
                    left: j * imageWidth,
                    top: i * imageHeight
                });
            }
        }
    }

    // 画像を結合して保存
    try {
        await sharp({
            create: {
                width: outputWidth,
                height: outputHeight,
                channels: 4, // RGBA (透明度を考慮)
                background: { r: 0, g: 0, b: 0, alpha: 0 } // 透明な背景
            }
        })
        .composite(imagesToComposite)
        .jpeg({ quality: 90 }) // JPG形式で保存、品質を90に設定
        .toFile(outputPath);

        console.log(`画像を結合し、${outputPath} に保存しました。`);
    } catch (error) {
        console.error("画像の結合中にエラーが発生しました:", error);
        throw error;
    }
}

function downloadImage(url, inputDir, filename) {
    return new Promise((resolve, reject) => {
        const filepath = path.join(inputDir, filename);
        const file = fs.createWriteStream(filepath);
        
        const request = https.get(url, (response) => {
            // HTTPSレスポンスが200以外の場合はエラー
            if (response.statusCode !== 200) {
                file.close();
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                reject(new Error(`HTTPエラー: ${response.statusCode} for URL: ${url}`));
                return;
            }
            
            // レスポンスをファイルに書き込み
            response.pipe(file);
            
            // ダウンロード完了時
            file.on('finish', () => {
                file.close();
                console.log(`画像を保存しました: ${filename}`);
                resolve(filename);
            });
        });
        
        // HTTPSリクエストエラー時
        request.on('error', (err) => {
            file.close();
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            reject(err);
        });
        
        // ファイル書き込みエラー時
        file.on('error', (err) => {
            file.close();
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            reject(err);
        });
        
        // タイムアウト設定（30秒）
        request.setTimeout(30000, () => {
            request.abort();
            file.close();
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            reject(new Error(`タイムアウト: ${url}`));
        });
    });
}

// 画像のダウンロード（Promise版）
async function downloadFromDynmap(domain, n, centerX, centerY, inputDir) {
    console.log("downloadFromDynmap start");
    const timestamp = Date.now(); // 現在のタイムスタンプを使用
    const bottomRight = {
        x: centerX - 4 * Math.floor(n / 2),
        y: centerY - 4 * Math.floor(n / 2)
    };
    
    const downloadPromises = [];
    
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const x = bottomRight.x + 4 * i;
            const y = bottomRight.y + 4 * j;
            const url = `https://${domain}/tiles/world/t/-1_0/zz_${x}_${y}.jpg?timestamp=${timestamp}`;
            console.log(`ダウンロード予定: ${url}`);
            
            const downloadPromise = downloadImage(
                url,
                inputDir,
                `image${i.toString().padStart(2, '0')}${j.toString().padStart(2, '0')}.jpg`
            );
            
            downloadPromises.push(downloadPromise);
        }
    }
    
    // すべてのダウンロードが完了するまで待機
    try {
        const results = await Promise.allSettled(downloadPromises);
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        console.log(`ダウンロード完了: 成功 ${successful}件, 失敗 ${failed}件`);
        
        if (failed > 0) {
            console.log('失敗したダウンロード:');
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.log(`  ${index}: ${result.reason.message}`);
                }
            });
        }
        
        if (successful === 0) {
            throw new Error('すべてのダウンロードに失敗しました');
        }
        
        return successful;
    } catch (error) {
        console.error('ダウンロード中にエラーが発生しました:', error);
        throw error;
    }
}

async function main(domain) {
    // 入力ディレクトリの準備
    if (fs.existsSync(inputDirectory)) {
        // 既存のファイルを削除
        const files = fs.readdirSync(inputDirectory);
        files.forEach(file => {
            fs.unlinkSync(path.join(inputDirectory, file));
        });
        console.log(`ディレクトリ ${inputDirectory} を清空しました。`);
    } else {
        fs.mkdirSync(inputDirectory, { recursive: true });
        console.log(`ディレクトリ ${inputDirectory} を作成しました。`);
    }

    try {
        const centerX = -12;
        const centerY = 8;
        
        // 画像をダウンロード（完了まで待機）
        const downloadedCount = await downloadFromDynmap(domain, n, centerX, centerY, inputDirectory);
        
        // ダウンロードされたファイルを確認
        const files = fs.readdirSync(inputDirectory)
            .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg'))
            .sort();
        
        console.log(`ダウンロードされたファイル (${files.length}件):`, files);
        
        if (files.length < n * n) {
            console.warn(`警告: 必要な画像数 (${n * n}) に対して、${files.length}枚しかダウンロードされませんでした。`);
        }
        
        // 画像を結合
        if (files.length === n * n) {
            await combineJpgImages(inputDirectory, outputFileName, n);
            console.log('処理が正常に完了しました。');
        } else {
            throw new Error(`画像の結合には${n * n}枚の画像が必要ですが、${files.length}枚しかありません。`);
        }
        
    } catch (error) {
        console.error("処理中にエラーが発生しました:", error.message);
        throw error;
    }
}
