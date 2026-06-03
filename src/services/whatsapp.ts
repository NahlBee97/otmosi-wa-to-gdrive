import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";
import path from "path";
import { getOrCreateFolder, uploadPhoto } from "./drive";
import { generateImageDescription } from "./ai";
import { myToId, parentFolderId } from "../config";

// 🔥 RUANG TUNGGU: Array untuk menampung foto-foto yang masuk sebelum diberi nama folder
let pendingMediaQueue: MessageMedia[] = [];

const toTitleCase = (str: string) => {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const initializeWhatsApp = () => {
  console.log("Inisialisasi WhatsApp Client...");

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true },
  });

  client.on("qr", (qr) => {
    console.log("\nScan QR Code ini menggunakan WhatsApp kamu:");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    console.log("\n✅ WhatsApp Client siap memantau chat pribadi!");
  });

  client.on("message_create", async (msg) => {
    // Hanya proses chat dari nomor sendiri
    if (msg.to === myToId) {
      // KONDISI 1: Pesan berupa Media (Foto/Video)
      if (msg.hasMedia) {
        console.log(
          "\n📥 Menerima file media, memasukkan ke ruang tunggu...",
        );
        try {
          const media = await msg.downloadMedia();
          if (media) {
            pendingMediaQueue.push(media);
            console.log(
              `📦 Status keranjang saat ini: ${pendingMediaQueue.length} foto.`,
            );
            // Kita tidak melakukan msg.reply di sini agar tidak spam saat forward massal
          }
        } catch (error) {
          console.error(
            "❌ Gagal mendownload media ke ruang tunggu:",
            error,
          );
        }
      }

      // KONDISI 2: Pesan berupa Teks DAN ada foto di ruang tunggu
      else if (msg.body && pendingMediaQueue.length > 0) {
        // Teks yang dikirim akan menjadi nama folder utama
        const folderName = msg.body.trim();

        // Kunci keranjang: pindahkan isinya ke memori lokal lalu kosongkan keranjang utama
        // agar kamu bisa mencicil forward foto untuk folder lokasi lain secara paralel
        const mediaToProcess = [...pendingMediaQueue];
        pendingMediaQueue = [];

        msg.reply(
          `⚙️ Memulai proses batch untuk ${mediaToProcess.length} foto ke folder *${folderName}*...`,
        );

        try {
          // Baca data dari src/data/dailyTreeCutting.json dengan path deterministik
          const dataPath = path.join(
            __dirname,
            "..",
            "data",
            "nursery.json",
          );
          if (!fs.existsSync(dataPath)) {
            msg.reply(
              "❌ File nursery.json tidak ditemukan!",
            );
            return;
          }
          const rawData = fs.readFileSync(dataPath, "utf8");

          let listData: any;
          try {
            listData = JSON.parse(rawData);
          } catch (err) {
            console.error("❌ JSON parse error:", err);
            msg.reply(
              "❌ File nursery.json berisi JSON tidak valid.",
            );
            return;
          }

          if (!Array.isArray(listData)) {
            msg.reply("❌ Format data tidak sesuai (bukan array).");
            return;
          }

          const allowedList = listData.map((item: any) => {
            const no = item["No."] ?? "";
            const indikator = toTitleCase(
              String(
                item["Indikator Keberhasilan Kerja"] ?? "",
              ).trim(),
            );
            return `${no} ${indikator}`.trim();
          });

          const folderId = await getOrCreateFolder(
            folderName,
            parentFolderId as string,
          );

          let successCount = 0;

          // Proses foto satu per satu menggunakan perulangan
          for (let i = 0; i < mediaToProcess.length; i++) {
            const media = mediaToProcess[i];
            const buffer = Buffer.from(media.data, "base64");

            console.log(
              `\n🔍 [${i + 1}/${mediaToProcess.length}] Menganalisis foto...`,
            );

            // Panggil AI
            const aiDescription = await generateImageDescription(
              buffer,
              media.mimetype,
              allowedList,
            );

            const fileName = `${aiDescription}.jpg`;

            await uploadPhoto(
              buffer,
              fileName,
              media.mimetype,
              folderId,
            );
            successCount++;
          }

          console.log(
            `🎉 Selesai! ${successCount} foto masuk ke folder ${folderName}.`,
          );
          msg.reply(
            `✅ Proses Selesai!\nBerhasil menyimpan ${successCount} foto ke dalam folder *${folderName}*.`,
          );
        } catch (error) {
          console.error("❌ Gagal memproses antrean foto:", error);
          msg.reply(
            "❌ Terjadi kesalahan sistem saat memproses batch foto.",
          );
        }
      }
    }
  });

  client.initialize();
};
