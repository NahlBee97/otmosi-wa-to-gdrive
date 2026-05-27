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

export const generateImageDescription = async (buffer: Buffer, mimeType: string): Promise<string> => {
    try {
        console.log('🤖 Menggandeng Gemini AI untuk menganalisis foto...');
        
        // Menggunakan model Gemini 1.5 Flash yang optimal untuk teks & gambar secara cepat
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

        const imagePart = bufferToGenerativePart(buffer, mimeType);
        
        // Instruksi (Prompt) ketat agar AI hanya mengembalikan nama file tanpa basa-basi
        const prompt = `
            Analisis foto lapangan pekerjaan konstruksi/teknis ini. 
            Berikan deskripsi singkat yang paling merepresentasikan aktivitas teknis atau objek utama dalam foto tersebut untuk dijadikan nama file.
            
            Aturan ketat:
            1. Gunakan Bahasa Indonesia.
            2. Gunakan huruf kecil semua (lowercase).
            3. Pisahkan setiap kata menggunakan spasi biasa ( ).
            4. Maksimal 3 sampai 4 kata saja.
            5. JANGAN memberikan teks penjelasan lain, jangan ada tanda baca, jangan ada kata "ini adalah", HANYA kembalikan nama filenya saja.
            
            Contoh hasil: 
            pengecoran lantai dasar
            pemasangan pipa pvc
            inspeksi alat berat
            pemasangan besi tiang
        `;

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        // Pembersihan karakter newline atau spasi liar dari respon AI
        return text.trim().replace(/\s+/g, ' ');
    } catch (error) {
        console.error('❌ Gemini AI gagal merespon:', error);
        return 'foto lapangan tanpa keterangan'; // Fallback jika AI error
    }
};