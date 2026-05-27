import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { getOrCreateFolder, uploadPhoto } from './drive';
import { myToId, parentFolderId } from '../config';
import { generateImageDescription } from './ai';

export const initializeWhatsApp = () => {
    console.log('Inisialisasi WhatsApp Client...');

    // LocalAuth digunakan agar bot menyimpan sesi login. 
    // Jadi kamu tidak perlu scan QR Code setiap kali script di-restart.
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            // Berjalan tanpa membuka jendela browser (background)
            headless: true, 
        }
    });

    // Event saat butuh scan QR
    client.on('qr', (qr) => {
        console.log('\nScan QR Code ini menggunakan WhatsApp kamu:');
        qrcode.generate(qr, { small: true });
    });

    // Event saat berhasil login dan siap digunakan
    client.on('ready', () => {
        console.log('\n✅ WhatsApp Client sudah terhubung dan siap memantau pesan pribadi!');
    });

    // Event saat ada pesan masuk (untuk uji coba awal)
    client.on('message_create', async (msg) => {
        if (msg.to === myToId) {
            console.log(`\n[Pesan Baru] Membaca pesan: ${msg.body}`);
            
            // Cek apakah pesan mengandung gambar/media
            if (msg.hasMedia) {
                console.log('\n📥 Menerima file media...');
                
                try {
                    const media = await msg.downloadMedia();
                    const buffer = Buffer.from(media.data, 'base64');
                    
                    // Saring lokasi dari caption teks. Contoh: "Hu'u" atau "Sila"
                    const caption = msg.body || 'Umum';
                    const folderName = caption.split('-')[0].trim();
                    
                    // 🔥 SIHIR AI: Biarkan Gemini yang menentukan nama deskripsi berdasarkan isi foto
                    const aiDescription = await generateImageDescription(buffer, media.mimetype);
                    
                    // Buat format nama file: tanggal_deskripsiai.jpg
                    const today = new Date().toISOString().slice(0, 10); // Format YYYY-MM-DD
                    const fileName = `${today}_${aiDescription}.jpg`;

                    const folderId = await getOrCreateFolder(folderName, parentFolderId as string);
                    await uploadPhoto(buffer, fileName, media.mimetype, folderId);
                    
                    console.log(`🎉 Sukses! File disimpan dengan nama: ${fileName}`);
                    msg.reply(`✅ Foto masuk ke folder *${folderName}*\nNama file: \`${fileName}\``);

                } catch (error) {
                    console.error('❌ Gagal memproses media:', error);
                    msg.reply('❌ Terjadi kesalahan saat memproses otomatisasi.');
                }
            }
        }
    });

    // Mulai jalankan client
    client.initialize();
};