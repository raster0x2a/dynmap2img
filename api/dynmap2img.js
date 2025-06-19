const inputDirectory = '/tmp/input_images'; // 入力画像があるディレクトリ
const outputFileName = '/tmp/output_image.jpg'; // 出力ファイル名
const n = 5;


module.exports = (req, res) => {
  const { domain } = req.query;
  main(domain);
  const check = fs.existsSync(outputFileName);
  
  fs.readdir('inputDirectory', function(err, files){
  	if (err) throw err;
  	var fileList = files.filter(function(file){
  		return fs.statSync(file).isFile() && /.*\.csv$/.test(file); //絞り込み
  	})
  	console.log(fileList);
  });
  
  if (check) {
    // 適切なヘッダーを設定
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1時間キャッシュ
    
    // 画像ファイルを送信
    res.sendFile(outputFileName);
  } else {
    res.status(200).send(`domain: ${domain}, check: ${check}`);
  }
}

// Generated with Gemini
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
function combineJpgImages(inputDir, outputPath, n) {
    if (n <= 0) {
        throw new Error("nは正の整数である必要があります。");
    }

    // ディレクトリ内のJPGファイルを取得
    const files = fs.readdirSync(inputDir)
                    .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg'))
                    .map(file => path.join(inputDir, file));

    if (files.length !== n * n) {
        throw new Error(`入力ディレクトリにはn^2 (${n * n}) 枚のJPG画像が必要です。現在 ${files.length} 枚の画像があります。`);
    }

    // 最初の画像のサイズを取得して、すべての画像が同じサイズであることを前提とします
    const firstImage = sharp(files[0]);
    const metadata = firstImage.metadata();
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

    for (let i = 0; i < n; i++) { // 行
        for (let j = 0; j < n; j++) { // 列
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
        sharp({
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

function downloadImage(url, inputDir, filename, callback) {
    const filapath = inputDir + '/' + filename;
    const file = fs.createWriteStream(filapath);
    
    const request = https.get(url, (response) => {
        // HTTPSレスポンスが200以外の場合はエラー
        if (response.statusCode !== 200) {
            file.close();
            fs.unlinkSync(filapath);
            callback(new Error(`HTTPエラー: ${response.statusCode}`));
            return;
        }
        
        // レスポンスをファイルに書き込み
        response.pipe(file);
        
        // ダウンロード完了時
        file.on('finish', () => {
            file.close();
            console.log(`画像を保存しました: ${filename}`);
            callback(null, filename);
        });
    });
    
    // HTTPSリクエストエラー時
    request.on('error', (err) => {
        file.close();
        fs.unlinkSync(filapath);
        callback(err);
    });
    
    // ファイル書き込みエラー時
    file.on('error', (err) => {
        file.close();
        fs.unlinkSync(filapath);
        callback(err);
    });
}

// 画像のダウンロード
function downloadFromDynmap(domain, n, centerX, centerY, inputDir) {
  const timestamp = "1750309360440";
  const bottomRight = {
    x: centerX - 4 * Math.floor(n / 2),
    y: centerY - 4 * Math.floor(n / 2)
  }
  for (let i = 0; i < n; i++ ) {
    for (let j = 0; j < n; j++ ) {
      const x = bottomRight.x + 4 * i;
      const y = bottomRight.y + 4 * j;
      const url = `https://${domain}/tiles/world/t/-1_0/zz_${x}_${y}.jpg?timestamp=${timestamp}`;
      downloadImage(
        url,
        inputDir,
        `image${i}${j}.jpg`,
        (err, filename) => {
          if (err) {
            console.error('ダウンロードエラー:', err.message);
          } else {
            console.log('ダウンロード成功:', filename);
          }
        }
      );
    }
  }
  
}

function main(domain) {
    if (!fs.existsSync(inputDirectory)) {
        fs.mkdirSync(inputDirectory);
        console.log(`ディレクトリ ${inputDirectory} を作成しました。`);
    }

    try {
        const centerX = -12;
        const centerY = 8;
        downloadFromDynmap(domain, n, centerX, centerY, inputDirectory);
        combineJpgImages(inputDirectory, outputFileName, n);
    } catch (error) {
        console.error("処理中にエラーが発生しました:", error.message);
    }
}
