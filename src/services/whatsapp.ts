import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { getOrCreateFolder, uploadPhoto } from './drive';
import { myToId, parentFolderId } from '../config';

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
                    // 1. Unduh foto dari WhatsApp ke memori (buffer)
                    const media = await msg.downloadMedia();
                    const buffer = Buffer.from(media.data, 'base64');
                    
                    // 2. Bedah caption untuk mencari Nama Folder dan Nama File
                    // Memisahkan teks berdasarkan tanda hubung "-"
                    const caption = msg.body || 'Uncategorized - Tanpa Keterangan';
                    const parts = caption.split('-');
                    
                    const folderName = parts[0] ? parts[0].trim() : 'Uncategorized';
                    const description = parts[1] ? parts[1].trim() : 'Foto Lapangan';
                    
                    // Buat nama file unik dengan timestamp agar tidak saling menimpa
                    const timestamp = new Date().getTime();
                    const fileName = `${description}_${timestamp}.jpg`;

                    // 3. Buat atau cari folder di Google Drive
                    const folderId = await getOrCreateFolder(folderName, parentFolderId as string);
                    
                    // 4. Upload foto ke folder tersebut
                    await uploadPhoto(buffer, fileName, media.mimetype, folderId as string);
                    
                    console.log('🎉 Selesai! Foto berhasil diamankan ke Google Drive.');
                    
                    // Bot membalas pesannya sendiri sebagai notifikasi sukses
                    msg.reply(`✅ Foto berhasil diupload ke folder: *${folderName}*`);

                } catch (error) {
                    console.error('❌ Gagal memproses media:', error);
                    msg.reply('❌ Terjadi kesalahan saat menyimpan foto ke Drive.');
                }
            }
        }
    });

    // Mulai jalankan client
    client.initialize();
};