import { google } from "googleapis";
import { Readable } from "stream";
import fs from "fs";
import readline from "readline";
import path from "path";

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const TOKEN_PATH = "token.json";
const CREDENTIALS_PATH = "oauth.json";

let driveClient: any = null;

// 🔥 MEKANISME KUNCI: Menyimpan antrean proses pembuatan folder yang sedang berjalan
const folderCreationQueue: { [key: string]: Promise<string> } = {};

export const initializeDrive = async () => {
  try {
    const credentialsFullPath = path.resolve(
      process.cwd(),
      CREDENTIALS_PATH,
    );
    const content = fs.readFileSync(credentialsFullPath, "utf-8");
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } =
      credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0],
    );

    const tokenFullPath = path.resolve(process.cwd(), TOKEN_PATH);
    if (fs.existsSync(tokenFullPath)) {
      const token = fs.readFileSync(tokenFullPath, "utf-8");
      oAuth2Client.setCredentials(JSON.parse(token));
      driveClient = google.drive({
        version: "v3",
        auth: oAuth2Client,
      });
      console.log("✅ Google Drive terhubung menggunakan OAuth 2.0");
    } else {
      // Sekarang proses ini benar-benar ditunggu sampai selesai (Promise diselesaikan)
      const tokens = await getNewToken(oAuth2Client);
      if (tokens) {
        oAuth2Client.setCredentials(tokens);
        driveClient = google.drive({
          version: "v3",
          auth: oAuth2Client,
        });
        console.log("✅ Google Drive terhubung dan token tersimpan.");
      }
    }
  } catch (error) {
    console.error(
      "❌ Gagal inisialisasi Google Drive. Pastikan file oauth.json ada.",
      error,
    );
  }
};

// 🛠️ PERBAIKAN 1: Membungkus fungsi dengan Promise agar bisa di-await oleh fungsi utama
const getNewToken = (oAuth2Client: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });

    console.log("\n🔐 Otorisasi Google Drive Dibutuhkan:");
    console.log("1. Buka URL ini di browser:\n", authUrl);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      "\n2. Paste SELURUH URL localhost hasil redirect ke sini:\n> ",
      (input) => {
        rl.close();

        let code = input.trim();

        if (input.startsWith("http")) {
          try {
            const url = new URL(input);
            code = url.searchParams.get("code") || input;
          } catch (error) {
            console.log(
              "⚠️ Peringatan: Format URL tidak standar, mencoba menggunakan input mentah.",
            );
          }
        }

        oAuth2Client.getToken(code, (err: any, token: any) => {
          if (err) {
            console.error(
              "❌ Gagal mendapatkan token OAuth2:",
              err.response?.data || err.message,
            );
            return reject(err); // Tolak Promise jika gagal
          }
          oAuth2Client.setCredentials(token);
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
          console.log(
            "\n✅ Token berhasil disimpan! Sistem otentikasi Google Drive sudah pulih.",
          );
          console.log(
            '👉 Silakan restart aplikasi dengan menekan Ctrl + C, lalu jalankan "npm run dev" kembali.\n',
          );
          resolve(token); // Kembalikan token agar bisa ditangkap oleh inisialisasi
        });
      },
    );
  });
};

export const getOrCreateFolder = async (
  folderName: string,
  parentFolderId: string,
): Promise<string> => {
  if (!driveClient)
    throw new Error("Drive Client belum diinisialisasi");

  const cacheKey = `${parentFolderId}_${folderName}`;

  // 🛠️ PERBAIKAN 2: Ambil referensi promise secara sinkronus tanpa await di dalam kondisi if
  const pendingPromise = folderCreationQueue[cacheKey];
  
  if (pendingPromise) {
    console.log(
      `⏳ Menunggu folder '${folderName}' selesai diproses oleh antrean paralel...`,
    );
    // Langsung tunggu dan kembalikan referensi yang sudah kita amankan tadi
    return await pendingPromise;
  }

  folderCreationQueue[cacheKey] = (async () => {
    const safeFolderName = folderName.replace(/'/g, "\\'");

    const res = await driveClient.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${safeFolderName}' and '${parentFolderId}' in parents and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    console.log(
      `📂 Folder '${folderName}' tidak ditemukan. Membuat folder baru...`,
    );
    const folder = await driveClient.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      },
      fields: "id",
    });
    return folder.data.id;
  })();

  try {
    const folderId = await folderCreationQueue[cacheKey];
    return folderId;
  } finally {
    delete folderCreationQueue[cacheKey];
  }
};

export const uploadPhoto = async (
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string,
) => {
  if (!driveClient)
    throw new Error("Drive Client belum diinisialisasi");
  const stream = Readable.from(buffer);
  const file = await driveClient.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: mimeType, body: stream },
    fields: "id",
  });
  return file.data.id;
};