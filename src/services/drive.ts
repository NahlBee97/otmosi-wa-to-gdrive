import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';
import readline from 'readline';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'oauth.json';

// Variabel global untuk menampung koneksi drive yang sudah terotorisasi
let driveClient: any = null;

export const initializeDrive = async () => {
    try {
        const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
        const credentials = JSON.parse(content);
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        // Cek apakah bot sudah pernah login sebelumnya
        if (fs.existsSync(TOKEN_PATH)) {
            const token = fs.readFileSync(TOKEN_PATH, 'utf-8');
            oAuth2Client.setCredentials(JSON.parse(token));
            driveClient = google.drive({ version: 'v3', auth: oAuth2Client });
            console.log('✅ Google Drive terhubung menggunakan OAuth 2.0');
        } else {
            // Jika belum, minta user untuk login
            await getNewToken(oAuth2Client);
        }
    } catch (error) {
        console.error('❌ Gagal inisialisasi Google Drive. Pastikan file oauth.json ada.', error);
    }
};

const getNewToken = (oAuth2Client: any) => {
    return new Promise((resolve, reject) => {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        
        console.log('\n========================================================');
        console.log('🔒 OTORISASI GOOGLE DRIVE DIBUTUHKAN');
        console.log('1. Klik URL di bawah ini untuk login dengan akun Google-mu:');
        console.log(authUrl);
        console.log('2. Setelah setuju, kamu akan diarahkan ke halaman "localhost" yang error.');
        console.log('3. Jangan panik! Copy URL dari address bar halaman error tersebut, lalu paste di terminal ini.');
        console.log('========================================================\n');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question('Paste URL hasil redirect di sini: ', (redirectUrl) => {
            rl.close();
            // Mengekstrak kode unik dari URL
            const urlObj = new URL(redirectUrl);
            const code = urlObj.searchParams.get('code');

            if (!code) {
                console.error('❌ Kode tidak ditemukan di dalam URL.');
                return reject('Kode tidak valid');
            }

            oAuth2Client.getToken(code, (err: any, token: any) => {
                if (err) return reject(err);
                oAuth2Client.setCredentials(token);
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
                console.log('✅ Kunci rahasia (Token) berhasil disimpan di token.json!');
                driveClient = google.drive({ version: 'v3', auth: oAuth2Client });
                resolve(true);
            });
        });
    });
};

export const getOrCreateFolder = async (folderName: string, parentFolderId: string) => {
    if (!driveClient) throw new Error('Drive Client belum diinisialisasi');
    
    // Menjinakkan tanda kutip tunggal khusus untuk string pencarian
    // Mengubah "Hu'u" menjadi "Hu\'u" agar query tidak rusak
    const safeFolderName = folderName.replace(/'/g, "\\'");
    
    const res = await driveClient.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${safeFolderName}' and '${parentFolderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
    });
    
    if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;

    // Saat proses pembuatan folder baru, tetap gunakan folderName asli 
    // agar nama foldernya di Google Drive tetap normal (tanpa backslash)
    const folder = await driveClient.files.create({
        requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] },
        fields: 'id',
    });
    return folder.data.id;
};

export const uploadPhoto = async (buffer: Buffer, fileName: string, mimeType: string, folderId: string) => {
    if (!driveClient) throw new Error('Drive Client belum diinisialisasi');
    const stream = Readable.from(buffer);
    const file = await driveClient.files.create({
        requestBody: { name: fileName, parents: [folderId] },
        media: { mimeType: mimeType, body: stream },
        fields: 'id',
    });
    return file.data.id;
};