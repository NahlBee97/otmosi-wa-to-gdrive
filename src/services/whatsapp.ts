import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";
import path from "path";
import { getOrCreateFolder, uploadPhoto } from "./drive";
import { myToId, parentFolderId } from "../config";
import { generateImageDescription } from "./ai";

// Fungsi utilitas untuk mengubah teks menjadi huruf kapital di setiap awal kata
const toTitleCase = (str: string) => {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const initializeWhatsApp = () => {
  console.log("Inisialisasi WhatsApp Client...");

  // LocalAuth digunakan agar bot menyimpan sesi login.
  // Jadi kamu tidak perlu scan QR Code setiap kali script di-restart.
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      // Berjalan tanpa membuka jendela browser (background)
      headless: true,
    },
  });

  // Event saat butuh scan QR
  client.on("qr", (qr) => {
    console.log("\nScan QR Code ini menggunakan WhatsApp kamu:");
    qrcode.generate(qr, { small: true });
  });

  // Event saat berhasil login dan siap digunakan
  client.on("ready", () => {
    console.log(
      "\n✅ WhatsApp Client sudah terhubung dan siap memantau pesan pribadi!",
    );
  });

  // Event saat ada pesan masuk (untuk uji coba awal)
  client.on("message_create", async (msg) => {
    if (msg.to === myToId) {
      console.log(`\n[Pesan Baru] Membaca pesan: ${msg.body}`);

      // Cek apakah pesan mengandung gambar/media
      if (msg.hasMedia) {
        console.log("\n📥 Menerima file media...");

        try {
          // 1. Baca data JSON yang berbentuk array of objects (lokasi deterministik)
          const dataPath = path.join(
            __dirname,
            "..",
            "data",
            "dailyTreeCutting.json",
          );
          if (!fs.existsSync(dataPath)) {
            console.error(
              "❌ File list nama tidak ditemukan!",
            );
            return;
          }
          const rawData = fs.readFileSync(dataPath, "utf8");

          let listData: any;
          try {
            listData = JSON.parse(rawData);
          } catch (err) {
            console.error("❌ JSON parse error:", err);
            return;
          }

          if (!Array.isArray(listData)) {
            console.error(
              "❌ Format data tidak sesuai (bukan array).",
            );
            return;
          }

          // 2. Format menjadi array string: "1.1.1 Kelengkapan Permit Kerja..."
          const allowedList = listData.map((item: any) => {
            const no = item["No."] ?? "";
            // Terapkan Title Case pada deskripsi pekerjaan (handle kosong)
            const indikator = toTitleCase(
              String(
                item["Indikator Keberhasilan Kerja"] ?? "",
              ).trim(),
            );
            return `${no} ${indikator}`.trim();
          });

          const media = await msg.downloadMedia();
          const buffer = Buffer.from(media.data, "base64");

          const caption = msg.body || "Umum";
          const folderName = caption.split("-")[0].trim();

          // 3. AI memilih satu deskripsi yang paling tepat dari allowedList
          const aiDescription = await generateImageDescription(
            buffer,
            media.mimetype,
            allowedList,
          );

            // 4. Simpan ke Google Drive dengan nama file yang sudah diperkaya AI
          const fileName = `${aiDescription}.jpg`;

          const folderId = await getOrCreateFolder(
            folderName,
            parentFolderId as string,
          );
          await uploadPhoto(
            buffer,
            fileName,
            media.mimetype,
            folderId,
          );

          console.log(
            `🎉 Sukses! File disimpan dengan nama: ${fileName}`,
          );
          msg.reply(
            `✅ Foto masuk ke folder *${folderName}*\nNama file: \`${fileName}\``,
          );
        } catch (error) {
          console.error("❌ Gagal memproses media:", error);
          msg.reply(
            "❌ Terjadi kesalahan saat memproses otomatisasi.",
          );
        }
      }
    }
  });

  // Mulai jalankan client
  client.initialize();
};
