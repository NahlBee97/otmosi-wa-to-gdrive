import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const bufferToGenerativePart = (buffer: Buffer, mimeType: string) => {
    return {
        inlineData: {
            data: buffer.toString('base64'),
            mimeType
        },
    };
};

// 🔥 MEKANISME KUNCI: Menyimpan status antrean agar request API tidak menumpuk di detik yang sama
let aiProcessingPromise = Promise.resolve();

export const generateImageDescription = async (buffer: Buffer, mimeType: string, allowedList: string[]): Promise<string> => {
    // 1. Kunci antrean: Paksa foto ini menunggu sampai foto sebelumnya selesai diproses AI
    await aiProcessingPromise;

    // 2. Buat gembok baru untuk menahan foto berikutnya
    let releaseLock: () => void;
    aiProcessingPromise = new Promise(resolve => {
        releaseLock = resolve as () => void;
    });

    try {
        console.log('🤖 Menggandeng Gemini AI untuk mengklasifikasikan foto...');
        
        // Beri jeda napas 3 detik sebelum menembak API Google agar terhindar dari limit 429
        await new Promise(resolve => setTimeout(resolve, 3000));

        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const imagePart = bufferToGenerativePart(buffer, mimeType);
        
        const daftarPilihanTeks = allowedList.map(item => `- ${item}`).join('\n');
        
        const prompt = `
            Analisis foto lapangan pekerjaan konstruksi/teknis ini.
            Tugasmu adalah MEMILIH SATU deskripsi yang paling cocok dan paling merepresentasikan aktivitas pada foto dari daftar pilihan yang disediakan di bawah ini.
            
            Aturan ketat:
            1. Kamu HANYA boleh memilih kata atau frasa yang ada di dalam "Daftar Pilihan Penamaan" di bawah.
            2. JANGAN PERNAH membuat kata, singkatan, atau frasa baru sendiri yang tidak ada di daftar.
            3. JANGAN memberikan teks penjelasan tambahan, jangan ada tanda baca, jangan ada kalimat pengantar. HANYA kembalikan frasa teks yang kamu pilih secara persis.
            
            Daftar Pilihan Penamaan:
            ${daftarPilihanTeks}
        `;

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text().trim();

        if (allowedList.includes(text)) {
            return text;
        } else {
            console.log(`⚠️ Gemini merespon di luar list: "${text}". Menggunakan cadangan pertama.`);
            return allowedList[0]; 
        }
        
    } catch (error) {
        console.error('❌ Gemini AI gagal merespon:', error);
        // Jika limit tetap jebol, kembalikan pilihan pertama dari list Excel kamu
        return allowedList[0]; 
    } finally {
        // 3. Wajib lepaskan kunci agar foto selanjutnya di dalam antrean bisa maju
        releaseLock!();
    }
};