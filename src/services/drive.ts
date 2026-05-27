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

const getNewToken = async (oAuth2Client: any) => {
  try {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    console.log("🔗 Buka URL ini di browser untuk memberikan akses:");
    console.log(authUrl);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const code: string = await new Promise((resolve) => {
      rl.question("Masukkan kode otorisasi di sini: ", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });

    const tokenResponse = await oAuth2Client.getToken(code);
    const tokens = tokenResponse.tokens || tokenResponse;

    const tokenFullPath = path.resolve(process.cwd(), TOKEN_PATH);
    fs.writeFileSync(tokenFullPath, JSON.stringify(tokens));
    console.log("✅ Token tersimpan di", tokenFullPath);

    return tokens;
  } catch (err) {
    console.error("❌ Gagal mendapatkan token baru:", err);
    return null;
  }
};

export const getOrCreateFolder = async (
  folderName: string,
  parentFolderId: string,
): Promise<string> => {
  if (!driveClient)
    throw new Error("Drive Client belum diinisialisasi");

  const cacheKey = `${parentFolderId}_${folderName}`;

  // 1. Jika folder ini SEDANG dalam proses dicari/dibuat oleh foto lain, ikuti antrean tersebut
  if (await folderCreationQueue[cacheKey]) {
    console.log(
      `⏳ Menunggu folder '${folderName}' selesai diproses oleh antrean paralel...`,
    );
    try {
      return await folderCreationQueue[cacheKey];
    } catch (err) {
      // Jika antrean sebelumnya gagal, pastikan properti dihapus dan lempar ulang error
      delete folderCreationQueue[cacheKey];
      throw err;
    }
  }

  // 2. Jika tidak ada di antrean, buat proses baru dan masukkan ke dalam antrean global
  folderCreationQueue[cacheKey] = (async () => {
    const safeFolderName = folderName.replace(/'/g, "\\'");

    // Cek keberadaan folder di Drive
    const res = await driveClient.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${safeFolderName}' and '${parentFolderId}' in parents and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    // Jika benar-benar belum ada, buat baru
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
    // Jalankan dan tunggu hingga selesai
    const folderId = await folderCreationQueue[cacheKey];
    return folderId;
  } finally {
    // Setelah selesai (sukses/gagal), hapus dari antrean memori agar hemat resource
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
