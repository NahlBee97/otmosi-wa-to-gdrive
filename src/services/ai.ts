import { GoogleGenerativeAI } from '@google/generative-ai';
import { geminiApiKey } from '../config';

// Inisialisasi SDK Gemini dengan API Key dari .env
const genAI = new GoogleGenerativeAI(geminiApiKey || '');

// Fungsi pembantu untuk mengubah buffer gambar menjadi format yang dipahami Gemini
const bufferToGenerativePart = (buffer: Buffer, mimeType: string) => {
    return {
        inlineData: {
            data: buffer.toString('base64'),
            mimeType
        },
    };
};

export const generateImageDescription = async (buffer: Buffer, mimeType: string, allowedList: string[]): Promise<string> => {
    try {
        console.log('🤖 Menggandeng Gemini AI untuk mengklasifikasikan foto...');
        
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        const imagePart = bufferToGenerativePart(buffer, mimeType);
        
        // Mengubah array daftar penamaan menjadi teks string berbutir untuk prompt
        const daftarPilihanTeks = allowedList.map(item => `- ${item}`).join('\n');
        
        // Kunci utamanya ada di instruksi ketat ini
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

        // Validasi tambahan: Pastikan hasil dari Gemini memang ada di dalam list kita
        // Jika karena suatu alasan Gemini melanggar aturan, kita gunakan fallback
        if (allowedList.includes(text)) {
            return text;
        } else {
            console.log(`⚠️ Gemini mengembalikan teks di luar list: "${text}". Menggunakan fallback.`);
            return allowedList[0]; // Ambil pilihan pertama dari list sebagai cadangan aman
        }
        
    } catch (error) {
        console.error('❌ Gemini AI gagal merespon:', error);
        return 'foto lapangan tanpa keterangan'; 
    }
};