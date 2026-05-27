import { initializeWhatsApp } from './services/whatsapp';
import { initializeDrive } from './services/drive';

const startApp = async () => {
    console.log('🚀 Memulai Sistem Otomasi BAST...');
    
    // Tunggu koneksi Drive siap (atau tunggu user login OAuth)
    await initializeDrive();
    
    // Baru jalankan WhatsApp
    initializeWhatsApp();
};

startApp();